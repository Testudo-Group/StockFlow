import { useState, useEffect } from 'react';
import { FiPlus } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { useCountry } from '../context/CountryContext';
import api from '../utils/api';
import Spinner from '../components/Spinner';
import PermissionGuard from '../components/PermissionGuard';
import { PERMISSIONS, ROLES } from '../utils/constants';
import StockAdjustmentModal from '../components/StockAdjustmentModal';
import StockHistoryModal from '../components/StockHistoryModal';
import StockTransferModal from '../components/StockTransferModal';
import ExportButton from '../components/ExportButton';
import useCurrency from '../hooks/useCurrency';

const Inventory = () => {
    const { user } = useAuth();
    const { activeCountry } = useCountry();
    const { format, symbol } = useCurrency();
    const [balances, setBalances] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [brands, setBrands] = useState([]);
    const [warehouseTotals, setWarehouseTotals] = useState([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [filterWarehouse, setFilterWarehouse] = useState('');
    const [filterProduct, setFilterProduct] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [filterBrand, setFilterBrand] = useState('');
    
    // Sorting
    const [sortBy, setSortBy] = useState(''); // 'cbm-asc', 'cbm-desc', 'value-asc', 'value-desc'

    // Modals
    const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);

    useEffect(() => {
        if (activeCountry?._id) fetchInitialData();
    }, [activeCountry?._id]);

    useEffect(() => {
        if (activeCountry?._id) fetchBalances();
    }, [filterWarehouse, filterProduct, filterCategory, filterBrand, activeCountry?._id]);

    const fetchInitialData = async () => {
        try {
            const countryParam = activeCountry?._id ? `?countryId=${activeCountry._id}` : '';
            const [whRes, prodRes, catRes, brandRes] = await Promise.all([
                api.get(`/warehouses${countryParam}`),
                api.get(`/products?limit=1000&countryId=${activeCountry._id}&includeUnpriced=true`),
                api.get('/categories'),
                api.get('/brands')
            ]);
            setWarehouses(whRes.data.data);
            setProducts(prodRes.data.data);
            setCategories(catRes.data.data);
            setBrands(brandRes.data.data);
        } catch (err) {
            console.error('Failed to load filters', err);
        }
    };

    const fetchBalances = async () => {
        setLoading(true);
        try {
            let query = '';
            const params = [];
            if (filterWarehouse) params.push(`warehouseId=${filterWarehouse}`);
            if (filterProduct) params.push(`productId=${filterProduct}`);
            if (filterCategory) params.push(`categoryId=${filterCategory}`);
            if (filterBrand) params.push(`brandId=${filterBrand}`);
            if (activeCountry?._id) params.push(`countryId=${activeCountry._id}`);
            if (params.length > 0) query = `?${params.join('&')}`;

            // Fetch both balance data and warehouse totals (for Dashboard correlation)
            const [balanceRes, analyticsRes] = await Promise.all([
                api.get(`/inventory/balance${query}`),
                api.get(`/analytics?countryId=${activeCountry?._id || ''}`)
            ]);
            
            setBalances(balanceRes.data.data);
            setWarehouseTotals(analyticsRes.data.data.warehouseCBM || []);
        } catch (err) {
            console.error('Failed to load inventory', err);
        } finally {
            setLoading(false);
        }
    };

    const handleAdjustClick = (balance) => {
        setSelectedItem({
            product: balance.product,
            warehouse: balance.warehouse
        });
        setIsAdjustModalOpen(true);
    };

    const handleHistoryClick = (balance) => {
        setSelectedItem({
            product: balance.product,
            warehouse: balance.warehouse
        });
        setIsHistoryModalOpen(true);
    };

    const handleTransferClick = (balance) => {
        setSelectedItem({
            product: balance.product,
            warehouse: balance.warehouse
        });
        setIsTransferModalOpen(true);
    };

    // Manual "Add Stock" - opens modal for user to select product and warehouse
    const handleManualAdd = () => {
        // If filters are selected, pre-populate the modal
        if (filterProduct && filterWarehouse) {
            const prod = products.find(p => p._id === filterProduct);
            const wh = warehouses.find(w => w._id === filterWarehouse);
            if (prod && wh) {
                setSelectedItem({ product: prod, warehouse: wh });
                setIsAdjustModalOpen(true);
                return;
            }
        }
        // Otherwise, open modal with no pre-selection (user will select in modal)
        setSelectedItem(null);
        setIsAdjustModalOpen(true);
    };

    const formatQuantity = (qty, cartonSize) => {
        const cartons = Math.floor(qty / cartonSize);
        const pieces = qty % cartonSize;
        return (
            <span>
                <strong>{cartons}</strong> ctns, {pieces} pcs
                <span className="text-muted"> ({qty} total)</span>
            </span>
        );
    };

    // Helper to link balance product with full product metadata
    const getRealProduct = (bal) => {
        if (!bal?.product) return null;
        const balProd = bal.product;
        // If product in balance already has the fields, return it
        if (balProd.price && balProd.dimensions) return balProd;

        // Otherwise, find the full product from our products state (fetched at startup)
        const id = balProd._id || balProd;
        const fullProd = products.find(p => p._id === id);
        return fullProd || balProd;
    };

    // Helper to calculate total value for a balance
    const calculateValue = (bal) => {
        const qty = bal.quantity || 0;
        const realProd = getRealProduct(bal);
        const wholesaleCost = realProd?.wholesaleCost || 0;
        return qty * wholesaleCost;
    };

    // Helper to calculate total CBM for a balance
    const calculateCBM = (bal) => {
        const realProd = getRealProduct(bal);
        const prod = realProd;
        if (!prod) return 0;

        const qty = bal.quantity || 0;
        const cartonSize = prod.cartonSize || 1;
        const cartons = qty / cartonSize;

        let unitVol = prod.volume || 0;

        // Fallback: Calculate volume from dimensions if field is 0
        // Dimensions are stored in meters, so volume = length * breadth * height (m³)
        if (unitVol === 0 && prod.dimensions) {
            const { length, breadth, height } = prod.dimensions;
            unitVol = parseFloat(length) * parseFloat(breadth) * parseFloat(height);
        }

        return cartons * unitVol;
    };

    // Sort balances based on sortBy state
    const getSortedBalances = () => {
        if (!sortBy) return balances;

        const sorted = [...balances].sort((a, b) => {
            if (sortBy === 'quantity-asc') {
                return (a.quantity || 0) - (b.quantity || 0);
            } else if (sortBy === 'quantity-desc') {
                return (b.quantity || 0) - (a.quantity || 0);
            } else if (sortBy === 'cbm-asc') {
                return calculateCBM(a) - calculateCBM(b);
            } else if (sortBy === 'cbm-desc') {
                return calculateCBM(b) - calculateCBM(a);
            } else if (sortBy === 'value-asc') {
                return calculateValue(a) - calculateValue(b);
            } else if (sortBy === 'value-desc') {
                return calculateValue(b) - calculateValue(a);
            }
            return 0;
        });

        return sorted;
    };

    const sortedBalances = getSortedBalances();

    // Prepare export data
    const getExportData = () => {
        return sortedBalances.map(bal => {
            const realProd = getRealProduct(bal);
            const price = realProd?.price || realProd?.wholesaleCost || 0;
            const value = (bal.quantity || 0) * price;
            const cbm = calculateCBM(bal);
            
            const exportRow = {
                sku: bal.product?.sku || '',
                productName: bal.product?.name || '',
                warehouse: bal.warehouse?.name || 'All Warehouses',
                cartonSize: bal.product?.cartonSize || '',
                quantity: bal.quantity || 0,
                cbm: parseFloat(cbm.toFixed(3))
            };

            // Only include value for ADMIN users
            if (user?.role === ROLES.ADMIN) {
                exportRow.value = parseFloat(value.toFixed(2));
            }

            return exportRow;
        });
    };

    const getExportColumns = () => {
        const columns = [
            { key: 'sku', label: 'SKU' },
            { key: 'productName', label: 'Product Name' },
            { key: 'warehouse', label: 'Warehouse' },
            { key: 'cartonSize', label: 'Carton Size' },
            { key: 'quantity', label: 'Quantity' }
        ];

        // Only include value column for ADMIN users
        if (user?.role === ROLES.ADMIN) {
            columns.push({ key: 'value', label: `Total Value (${symbol})` });
        }

        columns.push({ key: 'cbm', label: 'Total CBM (m³)' });

        return columns;
    };

    return (
        <div className="page-container">
            <div className="page-header">
                <h1>Inventory Overview</h1>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {balances.length > 0 && (
                        <ExportButton
                            data={getExportData()}
                            columns={getExportColumns()}
                            filename={`inventory-${new Date().toISOString().split('T')[0]}`}
                            label="Export"
                        />
                    )}
                    <PermissionGuard permission={PERMISSIONS.MANAGE_INVENTORY}>
                        <button onClick={handleManualAdd} className="btn btn-primary">
                            <FiPlus /> Add Inventory
                        </button>
                    </PermissionGuard>
                </div>
            </div>

            <div className="filters-bar">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#6B7A99' }}>Category:</span>
                    <select
                        value={filterCategory}
                        onChange={(e) => setFilterCategory(e.target.value)}
                        className="filter-select"
                    >
                        <option value="">All Categories</option>
                        {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                    </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#6B7A99' }}>Brand:</span>
                    <select
                        value={filterBrand}
                        onChange={(e) => setFilterBrand(e.target.value)}
                        className="filter-select"
                    >
                        <option value="">All Brands</option>
                        {brands.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                    </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#6B7A99' }}>Product:</span>
                    <select
                        value={filterProduct}
                        onChange={(e) => setFilterProduct(e.target.value)}
                        className="filter-select"
                    >
                        <option value="">All Products</option>
                        {products
                            .filter(p => {
                                // Filter by category if selected
                                if (filterCategory) {
                                    const productCategory = p.category?._id || p.category;
                                    if (productCategory !== filterCategory) return false;
                                }
                                // Filter by brand if selected
                                if (filterBrand) {
                                    const productBrand = p.brand?._id || p.brand;
                                    if (productBrand !== filterBrand) return false;
                                }
                                // If warehouse is selected, only show products that exist in current balances
                                if (filterWarehouse && balances.length > 0) {
                                    return balances.some(bal => 
                                        (bal.product?._id || bal.product) === p._id
                                    );
                                }
                                return true;
                            })
                            .map(p => <option key={p._id} value={p._id}>{p.name} ({p.sku})</option>)}
                    </select>
                </div>
            </div>

            {loading ? (
                <Spinner fullPage />
            ) : (
                <>
                    {/* Warehouse CBM Summary - Matches Dashboard */}
                    {warehouseTotals.length > 0 && (
                        <div style={{ 
                            background: '#F7FAFC', 
                            padding: '16px', 
                            borderRadius: '8px', 
                            marginBottom: '20px',
                            border: '1px solid #E2E8F0'
                        }}>
                            <h3 style={{ 
                                fontSize: '14px', 
                                fontWeight: 600, 
                                color: '#2D3748', 
                                marginBottom: '12px' 
                            }}>
                                Warehouse Volume Summary (Total CBM)
                            </h3>
                            <div style={{ 
                                display: 'grid', 
                                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                                gap: '12px' 
                            }}>
                                {warehouseTotals.map((wh) => (
                                    <div key={wh.name} style={{ 
                                        background: 'white', 
                                        padding: '12px', 
                                        borderRadius: '6px',
                                        border: '1px solid #E2E8F0'
                                    }}>
                                        <div style={{ 
                                            fontSize: '12px', 
                                            color: '#718096', 
                                            marginBottom: '4px' 
                                        }}>
                                            {wh.name}
                                        </div>
                                        <div style={{ 
                                            fontSize: '18px', 
                                            fontWeight: 700, 
                                            color: '#4880FF' 
                                        }}>
                                            {wh.value.toFixed(3)} m³
                                        </div>
                                        {/* <div style={{ 
                                            fontSize: '10px', 
                                            color: '#A0AEC0', 
                                            marginTop: '2px' 
                                        }}>
                                            Matches Dashboard chart
                                        </div> */}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="table-container">
                        <table className="data-table">
                        <thead>
                            <tr>
                                <th>Product</th>
                                <th style={{ width: '180px' }}>
                                    <select
                                        value={filterWarehouse}
                                        onChange={(e) => setFilterWarehouse(e.target.value)}
                                        className="table-header-select"
                                        title="Filter by Warehouse"
                                    >
                                        <option value="">All Warehouses </option>
                                        {warehouses.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
                                    </select>
                                </th>
                                <th>Carton Size</th>
                                <th 
                                    style={{ cursor: 'pointer', userSelect: 'none' }}
                                    onClick={() => setSortBy(sortBy === 'quantity-asc' ? 'quantity-desc' : 'quantity-asc')}
                                    title="Click to sort"
                                >
                                    Current Balance {sortBy === 'quantity-asc' ? '↑' : sortBy === 'quantity-desc' ? '↓' : '↕'}
                                </th>
                                {user?.role === ROLES.ADMIN && (
                                    <th 
                                        style={{ cursor: 'pointer', userSelect: 'none' }}
                                        onClick={() => setSortBy(sortBy === 'value-asc' ? 'value-desc' : 'value-asc')}
                                        title="Click to sort"
                                    >
                                        Total Value {sortBy === 'value-asc' ? '↑' : sortBy === 'value-desc' ? '↓' : '↕'}
                                    </th>
                                )}
                                <th 
                                    style={{ cursor: 'pointer', userSelect: 'none' }}
                                    onClick={() => setSortBy(sortBy === 'cbm-asc' ? 'cbm-desc' : 'cbm-asc')}
                                    title="Click to sort"
                                >
                                    Total CBM {sortBy === 'cbm-asc' ? '↑' : sortBy === 'cbm-desc' ? '↓' : '↕'}
                                </th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedBalances.length > 0 ? (
                                sortedBalances.map((bal) => (
                                    <tr key={bal._id}>
                                        <td>
                                            <div className="cell-primary">{bal.product?.name}</div>
                                            <div className="cell-secondary">{bal.product?.sku}</div>
                                        </td>
                                        <td>
                                            {bal.warehouse?._id ? (
                                                bal.warehouse.name
                                            ) : (
                                                <span className="status-badge" style={{ background: '#F0F4FF', color: '#4880FF' }}>
                                                    {bal.warehouse?.name}
                                                </span>
                                            )}
                                        </td>
                                        <td>{bal.product?.cartonSize}</td>
                                        <td>{formatQuantity(bal.quantity, bal.product?.cartonSize || 1)}</td>
                                        {user?.role === ROLES.ADMIN && (
                                            <td>
                                                <span style={{ fontWeight: 600, color: '#10B981' }}>
                                                    {format(calculateValue(bal))}
                                                </span>
                                            </td>
                                        )}
                                        <td>
                                            <span className="text-muted">
                                                {calculateCBM(bal).toFixed(3)} m³
                                            </span>
                                        </td>
                                        <td>
                                            {bal.warehouse?._id ? (
                                                <div className="button-group" style={{ gap: '4px' }}>
                                                    <PermissionGuard permission={PERMISSIONS.MANAGE_INVENTORY}>
                                                        <button
                                                            onClick={() => handleAdjustClick(bal)}
                                                            className="btn btn-xs btn-secondary"
                                                            style={{ padding: '2px 6px', fontSize: '10px' }}
                                                        >
                                                            Adjust
                                                        </button>
                                                    </PermissionGuard>
                                                    <button
                                                        onClick={() => handleHistoryClick(bal)}
                                                        className="btn btn-xs btn-secondary"
                                                        style={{ padding: '2px 6px', fontSize: '10px' }}
                                                    >
                                                        History
                                                    </button>
                                                    <PermissionGuard permission={PERMISSIONS.MANAGE_INVENTORY}>
                                                        <button
                                                            onClick={() => handleTransferClick(bal)}
                                                            className="btn btn-xs btn-secondary"
                                                            style={{ padding: '2px 6px', fontSize: '10px' }}
                                                        >
                                                            Transfer
                                                        </button>
                                                    </PermissionGuard>
                                                </div>
                                            ) : (
                                                <span className="text-muted" style={{ fontSize: '0.8rem' }}>Select warehouse to adjust</span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={user?.role === ROLES.ADMIN ? "7" : "6"} className="text-center">
                                        No stock found. {(!filterProduct || !filterWarehouse) && "Use filters to add new stock."}
                                    </td>
                                </tr>
                            )}
                            {balances.length > 0 && (
                                <tr className="grand-total-row">
                                    <td colSpan="4" style={{ textAlign: 'right' }}>
                                        {filterWarehouse || filterProduct ? 'Filtered Total:' : 'Grand Total:'}
                                    </td>
                                    {user?.role === ROLES.ADMIN && (
                                        <td>
                                            {format(balances.reduce((sum, b) => sum + calculateValue(b), 0))}
                                        </td>
                                    )}
                                    <td>
                                        {balances.reduce((sum, b) => sum + calculateCBM(b), 0).toFixed(3)} m³
                                        {(filterWarehouse || filterProduct) && (
                                            <div style={{ fontSize: '10px', color: '#999', marginTop: '2px' }}>
                                                (Filtered view - see summary above for warehouse totals)
                                            </div>
                                        )}
                                    </td>
                                    <td></td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                </>
            )}

            {selectedItem && (
                <>
                    <StockAdjustmentModal
                        isOpen={isAdjustModalOpen}
                        onClose={() => setIsAdjustModalOpen(false)}
                        product={selectedItem.product}
                        warehouse={selectedItem.warehouse}
                        onSuccess={fetchBalances}
                    />
                    <StockHistoryModal
                        isOpen={isHistoryModalOpen}
                        onClose={() => setIsHistoryModalOpen(false)}
                        product={selectedItem.product}
                        warehouse={selectedItem.warehouse}
                    />
                    <StockTransferModal
                        isOpen={isTransferModalOpen}
                        onClose={() => setIsTransferModalOpen(false)}
                        product={selectedItem.product}
                        sourceWarehouse={selectedItem.warehouse}
                        warehouses={warehouses}
                        onSuccess={fetchBalances}
                    />
                </>
            )}
        </div>
    );
};

export default Inventory;
