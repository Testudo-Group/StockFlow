import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { FiPlus, FiEdit2, FiTrash2, FiPackage, FiX, FiDollarSign, FiClock, FiArrowRight, FiRotateCcw } from 'react-icons/fi';
import api from '../utils/api';
import Spinner from '../components/Spinner';
import PermissionGuard from '../components/PermissionGuard';
import { PERMISSIONS } from '../utils/constants';
import useCurrency from '../hooks/useCurrency';
import { useCountry } from '../context/CountryContext';

const Bundles = () => {
    const { formatShort, symbol } = useCurrency();
    const { activeCountry } = useCountry();
    const [bundles, setBundles] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingBundle, setEditingBundle] = useState(null);
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        products: [],
        status: 'ACTIVE'
    });

    // Price edit modal state
    const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
    const [pricingBundle, setPricingBundle] = useState(null);
    const [priceFormData, setPriceFormData] = useState({
        retailPrice: '',
        reason: ''
    });
    const [priceSubmitting, setPriceSubmitting] = useState(false);

    // Price history modal state
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [historyData, setHistoryData] = useState(null);
    const [historyLoading, setHistoryLoading] = useState(false);

    useEffect(() => {
        if (!activeCountry?._id) return;
        // Prices are per country, so re-fetch whenever the country changes.
        fetchBundles();
        fetchProducts();
    }, [activeCountry?._id]);

    const fetchBundles = async () => {
        try {
            const res = await api.get(`/bundles?countryId=${activeCountry._id}`);
            setBundles(res.data.data);
        } catch (err) {
            toast.error('Failed to load bundles');
        } finally {
            setLoading(false);
        }
    };

    const fetchProducts = async () => {
        try {
            const res = await api.get(`/products?limit=1000&countryId=${activeCountry._id}`);
            setProducts(res.data.data.filter(p => p.status === 'ACTIVE'));
        } catch (err) {
            console.error('Failed to load products', err);
        }
    };

    const handleOpenModal = (bundle = null) => {
        if (bundle) {
            setEditingBundle(bundle);
            setFormData({
                name: bundle.name,
                description: bundle.description || '',
                products: bundle.products.map(p => ({
                    product: p.product._id,
                    quantity: p.quantity
                })),
                status: bundle.status
            });
        } else {
            setEditingBundle(null);
            setFormData({
                name: '',
                description: '',
                products: [],
                status: 'ACTIVE'
            });
        }
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingBundle(null);
        setFormData({
            name: '',
            description: '',
            products: [],
            status: 'ACTIVE'
        });
    };

    const addProductToBundle = () => {
        setFormData({
            ...formData,
            products: [...formData.products, { product: '', quantity: 1 }]
        });
    };

    const removeProductFromBundle = (index) => {
        const newProducts = [...formData.products];
        newProducts.splice(index, 1);
        setFormData({ ...formData, products: newProducts });
    };

    const updateBundleProduct = (index, field, value) => {
        const newProducts = [...formData.products];
        newProducts[index][field] = value;
        setFormData({ ...formData, products: newProducts });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (formData.products.length === 0) {
            return toast.error('Bundle must contain at least one product');
        }

        try {
            if (editingBundle) {
                await api.put(`/bundles/${editingBundle._id}`, formData);
                toast.success('Bundle updated successfully');
            } else {
                await api.post('/bundles', formData);
                toast.success('Bundle created successfully');
            }
            handleCloseModal();
            fetchBundles();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save bundle');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this bundle?')) return;

        try {
            await api.delete(`/bundles/${id}`);
            toast.success('Bundle deleted successfully');
            fetchBundles();
        } catch (err) {
            toast.error('Failed to delete bundle');
        }
    };

    const calculateBundleRetailPrice = (bundle) => {
        return bundle.products.reduce((sum, item) => {
            return sum + (item.quantity * (item.product?.price || 0));
        }, 0);
    };

    // Products carry a price per country. Any that are unpriced in the active
    // country are missing from the calculated total, so name them rather than
    // quietly under-counting the bundle.
    const unpricedProductsIn = (bundle) =>
        (bundle.products || [])
            .filter((item) => item.product && item.product.price == null)
            .map((item) => item.product.name);

    const calculateBundleWholesalePrice = (bundle) => {
        return bundle.products.reduce((sum, item) => {
            return sum + (item.quantity * (item.product?.wholesaleCost || 0));
        }, 0);
    };

    // --- Price Edit Modal ---
    const handleOpenPriceModal = (bundle) => {
        setPricingBundle(bundle);
        setPriceFormData({
            retailPrice: bundle.retailPrice != null ? String(bundle.retailPrice) : '',
            reason: ''
        });
        setIsPriceModalOpen(true);
    };

    const handleClosePriceModal = () => {
        setIsPriceModalOpen(false);
        setPricingBundle(null);
        setPriceFormData({ retailPrice: '', reason: '' });
    };

    const handlePriceSubmit = async (e) => {
        e.preventDefault();
        if (!pricingBundle) return;

        setPriceSubmitting(true);
        try {
            await api.put(`/bundles/${pricingBundle._id}/price`, {
                countryId: activeCountry._id,
                retailPrice: priceFormData.retailPrice !== '' ? Number(priceFormData.retailPrice) : null,
                reason: priceFormData.reason
            });
            toast.success('Bundle price updated successfully');
            handleClosePriceModal();
            fetchBundles();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to update price');
        } finally {
            setPriceSubmitting(false);
        }
    };

    const handleResetPrice = async () => {
        if (!pricingBundle) return;
        if (!window.confirm('Reset to calculated price? This will remove the custom price override.')) return;

        setPriceSubmitting(true);
        try {
            await api.put(`/bundles/${pricingBundle._id}/price`, {
                countryId: activeCountry._id,
                retailPrice: null,
                reason: 'Reset to calculated price'
            });
            toast.success('Price reset to calculated value');
            handleClosePriceModal();
            fetchBundles();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to reset price');
        } finally {
            setPriceSubmitting(false);
        }
    };

    // --- Price History Modal ---
    const handleOpenHistoryModal = async (bundle) => {
        setIsHistoryModalOpen(true);
        setHistoryLoading(true);
        try {
            const res = await api.get(`/bundles/${bundle._id}/price-history?countryId=${activeCountry._id}`);
            setHistoryData(res.data.data);
        } catch (err) {
            toast.error('Failed to load price history');
            setIsHistoryModalOpen(false);
        } finally {
            setHistoryLoading(false);
        }
    };

    const handleCloseHistoryModal = () => {
        setIsHistoryModalOpen(false);
        setHistoryData(null);
    };

    const formatDate = (dateStr) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-GB', {
            day: 'numeric', month: 'short', year: 'numeric'
        }) + ' at ' + d.toLocaleTimeString('en-GB', {
            hour: '2-digit', minute: '2-digit'
        });
    };

    const getDisplayPrice = (bundle) => {
        const calculatedPrice = calculateBundleRetailPrice(bundle);
        const hasCustomPrice = bundle.retailPrice != null;
        return { calculatedPrice, hasCustomPrice, customPrice: bundle.retailPrice };
    };

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const getSortedBundles = () => {
        if (!sortConfig.key) return bundles;

        return [...bundles].sort((a, b) => {
            let aValue, bValue;

            switch (sortConfig.key) {
                case 'name':
                    aValue = (a.name || '').toLowerCase();
                    bValue = (b.name || '').toLowerCase();
                    break;
                case 'productsCount':
                    aValue = a.products?.length || 0;
                    bValue = b.products?.length || 0;
                    break;
                case 'retailPrice': {
                    const aPriceInfo = getDisplayPrice(a);
                    const bPriceInfo = getDisplayPrice(b);
                    aValue = aPriceInfo.hasCustomPrice ? aPriceInfo.customPrice : aPriceInfo.calculatedPrice;
                    bValue = bPriceInfo.hasCustomPrice ? bPriceInfo.customPrice : bPriceInfo.calculatedPrice;
                    break;
                }
                case 'wholesalePrice':
                    aValue = calculateBundleWholesalePrice(a);
                    bValue = calculateBundleWholesalePrice(b);
                    break;
                default:
                    return 0;
            }

            if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    };

    const sortedBundles = getSortedBundles();

    if (loading) return <Spinner fullPage />;

    return (
        <div className="page-container">
            <div className="page-header">
                <h1>Product Bundles</h1>
                <PermissionGuard permission={PERMISSIONS.MANAGE_INVENTORY}>
                    <button onClick={() => handleOpenModal()} className="btn btn-primary">
                        <FiPlus /> Create Bundle
                    </button>
                </PermissionGuard>
            </div>

            <div className="card">
                <div style={{ overflowX: 'auto' }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th
                                    style={{ cursor: 'pointer', userSelect: 'none' }}
                                    onClick={() => handleSort('name')}
                                    title="Click to sort"
                                >
                                    Bundle Name {sortConfig.key === 'name' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                                </th>
                                <th
                                    style={{ cursor: 'pointer', userSelect: 'none' }}
                                    onClick={() => handleSort('productsCount')}
                                    title="Click to sort"
                                >
                                    Products {sortConfig.key === 'productsCount' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                                </th>
                                <th
                                    style={{ cursor: 'pointer', userSelect: 'none' }}
                                    onClick={() => handleSort('retailPrice')}
                                    title="Click to sort"
                                >
                                    Retail Price {sortConfig.key === 'retailPrice' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                                </th>
                                <th
                                    style={{ cursor: 'pointer', userSelect: 'none' }}
                                    onClick={() => handleSort('wholesalePrice')}
                                    title="Click to sort"
                                >
                                    Wholesale Price {sortConfig.key === 'wholesalePrice' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                                </th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedBundles.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="text-center">No bundles found</td>
                                </tr>
                            ) : (
                                sortedBundles.map(bundle => {
                                    const { calculatedPrice, hasCustomPrice, customPrice } = getDisplayPrice(bundle);
                                    const discount = hasCustomPrice ? Math.round((1 - customPrice / calculatedPrice) * 100) : 0;

                                    return (
                                        <tr key={bundle._id}>
                                            <td>
                                                <div style={{ fontWeight: 600 }}>{bundle.name}</div>
                                                {bundle.description && (
                                                    <div style={{ fontSize: '12px', color: '#64748B' }}>
                                                        {bundle.description}
                                                    </div>
                                                )}
                                            </td>
                                            <td>
                                                <div style={{ fontSize: '12px' }}>
                                                    {bundle.products.map((item, idx) => (
                                                        <div key={idx} style={{ marginBottom: '2px' }}>
                                                            {item.quantity}x {item.product?.name}
                                                        </div>
                                                    ))}
                                                </div>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                    {hasCustomPrice ? (
                                                        <>
                                                            <span style={{ fontWeight: 600, color: '#059669' }}>
                                                                {formatShort(customPrice)}
                                                            </span>
                                                            <span style={{
                                                                textDecoration: 'line-through',
                                                                color: '#94A3B8',
                                                                fontSize: '12px'
                                                            }}>
                                                                {formatShort(calculatedPrice)}
                                                            </span>
                                                            {discount > 0 && (
                                                                <span style={{
                                                                    background: '#DCFCE7',
                                                                    color: '#166534',
                                                                    padding: '1px 6px',
                                                                    borderRadius: '4px',
                                                                    fontSize: '11px',
                                                                    fontWeight: 600
                                                                }}>
                                                                    -{discount}%
                                                                </span>
                                                            )}
                                                            <span style={{
                                                                background: '#FEF3C7',
                                                                color: '#92400E',
                                                                padding: '1px 6px',
                                                                borderRadius: '4px',
                                                                fontSize: '11px',
                                                                fontWeight: 500
                                                            }}>
                                                                Custom
                                                            </span>
                                                        </>
                                                    ) : (
                                                        <span>{formatShort(calculatedPrice)}</span>
                                                    )}
                                                    {unpricedProductsIn(bundle).length > 0 && (
                                                        <span
                                                            style={{
                                                                background: '#FEF3C7',
                                                                color: '#B45309',
                                                                padding: '1px 6px',
                                                                borderRadius: '4px',
                                                                fontSize: '11px',
                                                                fontWeight: 600,
                                                            }}
                                                            title={`Not priced in ${activeCountry?.name}: ${unpricedProductsIn(bundle).join(', ')}`}
                                                        >
                                                            {unpricedProductsIn(bundle).length} unpriced
                                                        </span>
                                                    )}
                                                    <PermissionGuard permission={PERMISSIONS.MANAGE_INVENTORY}>
                                                        <button
                                                            onClick={() => handleOpenPriceModal(bundle)}
                                                            className="btn-icon edit"
                                                            title="Edit Price"
                                                            style={{ padding: '2px 4px', fontSize: '12px' }}
                                                        >
                                                            Edit
                                                        </button>
                                                    </PermissionGuard>
                                                    {bundle.priceHistory && bundle.priceHistory.length > 0 && (
                                                        <button
                                                            onClick={() => handleOpenHistoryModal(bundle)}
                                                            className="btn-icon"
                                                            title="View Price History"
                                                            style={{
                                                                padding: '2px 4px',
                                                                fontSize: '12px',
                                                                color: '#6366F1',
                                                                background: '#EEF2FF',
                                                                border: 'none',
                                                                borderRadius: '4px',
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            <FiClock size={13} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                            <td>{formatShort(calculateBundleWholesalePrice(bundle))}</td>
                                            <td>
                                                <span className={`badge ${bundle.status === 'ACTIVE' ? 'badge-success' : 'badge-secondary'}`}>
                                                    {bundle.status}
                                                </span>
                                            </td>
                                            <td>
                                                <PermissionGuard permission={PERMISSIONS.MANAGE_INVENTORY}>
                                                    <div className="action-buttons">
                                                        <button
                                                            onClick={() => handleOpenModal(bundle)}
                                                            className="btn-icon edit"
                                                            title="Edit"
                                                        >
                                                            <FiEdit2 />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(bundle._id)}
                                                            className="btn-icon delete"
                                                            title="Delete"
                                                        >
                                                            <FiTrash2 />
                                                        </button>
                                                    </div>
                                                </PermissionGuard>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Bundle Create/Edit Modal */}
            {isModalOpen && (
                <div className="modal-overlay" onClick={handleCloseModal}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px' }}>
                        <div className="modal-header">
                            <h2>{editingBundle ? 'Edit Bundle' : 'Create Bundle'}</h2>
                            <button onClick={handleCloseModal} className="modal-close">
                                <FiX />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label>Bundle Name *</label>
                                    <input
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Description</label>
                                    <textarea
                                        value={formData.description}
                                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                                        rows="2"
                                    />
                                </div>

                                <div className="form-group">
                                    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>Bundle Products *</span>
                                        <button
                                            type="button"
                                            onClick={addProductToBundle}
                                            className="btn btn-secondary btn-sm"
                                        >
                                            <FiPlus /> Add Product
                                        </button>
                                    </label>

                                    {formData.products.length === 0 ? (
                                        <div style={{
                                            padding: '20px',
                                            textAlign: 'center',
                                            color: '#64748B',
                                            background: '#F7FAFC',
                                            borderRadius: '6px'
                                        }}>
                                            No products added. Click "Add Product" to start building your bundle.
                                        </div>
                                    ) : (
                                        <div style={{ marginTop: '10px' }}>
                                            {formData.products.map((item, idx) => (
                                                <div key={idx} style={{
                                                    display: 'flex',
                                                    gap: '10px',
                                                    marginBottom: '10px',
                                                    alignItems: 'flex-start'
                                                }}>
                                                    <div style={{ flex: 2 }}>
                                                        <select
                                                            value={item.product}
                                                            onChange={e => updateBundleProduct(idx, 'product', e.target.value)}
                                                            required
                                                            style={{ width: '100%' }}
                                                        >
                                                            <option value="">Select Product</option>
                                                            {products.map(p => (
                                                                <option key={p._id} value={p._id}>
                                                                    {p.name} ({p.sku})
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div style={{ width: '100px' }}>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            value={item.quantity}
                                                            onChange={e => updateBundleProduct(idx, 'quantity', parseInt(e.target.value))}
                                                            placeholder="Qty"
                                                            required
                                                            style={{ width: '100%' }}
                                                        />
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeProductFromBundle(idx)}
                                                        className="btn-icon delete"
                                                        title="Remove"
                                                    >
                                                        <FiTrash2 />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="form-group">
                                    <label>Status</label>
                                    <select
                                        value={formData.status}
                                        onChange={e => setFormData({ ...formData, status: e.target.value })}
                                    >
                                        <option value="ACTIVE">Active</option>
                                        <option value="INACTIVE">Inactive</option>
                                    </select>
                                </div>
                            </div>

                            <div className="modal-footer">
                                <button type="button" onClick={handleCloseModal} className="btn btn-secondary">
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    {editingBundle ? 'Update Bundle' : 'Create Bundle'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Price Edit Modal */}
            {isPriceModalOpen && pricingBundle && (
                <div className="modal-overlay" onClick={handleClosePriceModal}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                        <div className="modal-header">
                            <h2>Edit Retail Price</h2>
                            <button onClick={handleClosePriceModal} className="modal-close">
                                <FiX />
                            </button>
                        </div>

                        <form onSubmit={handlePriceSubmit}>
                            <div className="modal-body">
                                <div style={{
                                    background: '#F8FAFC',
                                    padding: '12px 16px',
                                    borderRadius: '8px',
                                    marginBottom: '16px',
                                    border: '1px solid #E2E8F0'
                                }}>
                                    <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '4px' }}>
                                        Bundle: <strong style={{ color: '#1E293B' }}>{pricingBundle.name}</strong>
                                    </div>
                                    <div style={{ fontSize: '13px', color: '#64748B' }}>
                                        Calculated Price: <strong style={{ color: '#1E293B' }}>
                                            {formatShort(calculateBundleRetailPrice(pricingBundle))}
                                        </strong>
                                    </div>
                                    {pricingBundle.retailPrice != null && (
                                        <div style={{ fontSize: '13px', color: '#64748B', marginTop: '2px' }}>
                                            Current Custom Price: <strong style={{ color: '#059669' }}>
                                                {formatShort(pricingBundle.retailPrice)}
                                            </strong>
                                        </div>
                                    )}
                                </div>

                                <div className="form-group">
                                    <label>New Retail Price ({symbol})</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={priceFormData.retailPrice}
                                        onChange={e => setPriceFormData({ ...priceFormData, retailPrice: e.target.value })}
                                        placeholder="Enter custom price..."
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Reason / Note</label>
                                    <textarea
                                        value={priceFormData.reason}
                                        onChange={e => setPriceFormData({ ...priceFormData, reason: e.target.value })}
                                        rows="2"
                                        placeholder="e.g. Seasonal discount, Bulk deal, Promo..."
                                    />
                                </div>
                            </div>

                            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
                                <div>
                                    {pricingBundle.retailPrice != null && (
                                        <button
                                            type="button"
                                            onClick={handleResetPrice}
                                            disabled={priceSubmitting}
                                            className="btn btn-secondary"
                                            style={{
                                                color: '#DC2626',
                                                borderColor: '#FCA5A5',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                        >
                                            <FiRotateCcw size={14} /> Reset to Calculated
                                        </button>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button type="button" onClick={handleClosePriceModal} className="btn btn-secondary">
                                        Cancel
                                    </button>
                                    <button type="submit" disabled={priceSubmitting} className="btn btn-primary">
                                        {priceSubmitting ? 'Saving...' : 'Update Price'}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Price History Modal */}
            {isHistoryModalOpen && (
                <div className="modal-overlay" onClick={handleCloseHistoryModal}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                        <div className="modal-header">
                            <h2>Price Edit History</h2>
                            <button onClick={handleCloseHistoryModal} className="modal-close">
                                <FiX />
                            </button>
                        </div>

                        <div className="modal-body">
                            {historyLoading ? (
                                <div style={{ textAlign: 'center', padding: '30px' }}>
                                    <Spinner />
                                </div>
                            ) : historyData && historyData.history.length > 0 ? (
                                <>
                                    <div style={{
                                        background: '#F8FAFC',
                                        padding: '10px 14px',
                                        borderRadius: '8px',
                                        marginBottom: '16px',
                                        border: '1px solid #E2E8F0',
                                        fontSize: '13px',
                                        color: '#64748B'
                                    }}>
                                        <strong style={{ color: '#1E293B' }}>{historyData.bundleName}</strong> — {historyData.history.length} price edit{historyData.history.length !== 1 ? 's' : ''}
                                    </div>
                                    <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                        {historyData.history.map((entry, idx) => (
                                            <div key={idx} style={{
                                                padding: '12px 14px',
                                                background: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC',
                                                borderRadius: '8px',
                                                marginBottom: '8px',
                                                border: '1px solid #E2E8F0'
                                            }}>
                                                <div style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    marginBottom: '6px'
                                                }}>
                                                    <div style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '8px',
                                                        fontSize: '14px',
                                                        fontWeight: 600
                                                    }}>
                                                        <span style={{ color: entry.previousPrice != null ? '#94A3B8' : '#64748B' }}>
                                                            {entry.previousPrice != null
                                                                ? formatShort(entry.previousPrice)
                                                                : 'Calculated'}
                                                        </span>
                                                        <FiArrowRight size={14} style={{ color: '#94A3B8' }} />
                                                        <span style={{ color: entry.newPrice != null ? '#059669' : '#64748B' }}>
                                                            {entry.newPrice != null
                                                                ? formatShort(entry.newPrice)
                                                                : 'Calculated'}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div style={{ fontSize: '12px', color: '#64748B' }}>
                                                    <span style={{
                                                        background: '#EEF2FF',
                                                        color: '#4338CA',
                                                        padding: '1px 6px',
                                                        borderRadius: '4px',
                                                        fontWeight: 500,
                                                        marginRight: '6px'
                                                    }}>
                                                        {entry.editedBy?.username || entry.editedBy?.email || 'Unknown'}
                                                    </span>
                                                    <span>{formatDate(entry.editedAt)}</span>
                                                </div>
                                                {entry.reason && (
                                                    <div style={{
                                                        fontSize: '12px',
                                                        color: '#475569',
                                                        marginTop: '6px',
                                                        fontStyle: 'italic',
                                                        background: '#FFFBEB',
                                                        padding: '4px 8px',
                                                        borderRadius: '4px',
                                                        borderLeft: '3px solid #F59E0B'
                                                    }}>
                                                        "{entry.reason}"
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <div style={{
                                    textAlign: 'center',
                                    padding: '30px',
                                    color: '#64748B'
                                }}>
                                    No price edits recorded for this bundle.
                                </div>
                            )}
                        </div>

                        <div className="modal-footer">
                            <button onClick={handleCloseHistoryModal} className="btn btn-secondary">
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Bundles;
