import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { FiPlus, FiEdit2, FiTrash2, FiX } from 'react-icons/fi';
import api from '../utils/api';
import Spinner from '../components/Spinner';
import PermissionGuard from '../components/PermissionGuard';
import { PERMISSIONS } from '../utils/constants';
import ExportButton from '../components/ExportButton';
import useCurrency from '../hooks/useCurrency';
import { useCountry } from '../context/CountryContext';
import { currencyOf } from '../utils/currency';

const Products = () => {
    const { symbol, format } = useCurrency();
    const { activeCountry, availableCountries } = useCountry();
    const [products, setProducts] = useState([]);
    const [brands, setBrands] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({ totalPages: 1, total: 0 });

    const [filterBrand, setFilterBrand] = useState('');
    const [filterCategory, setFilterCategory] = useState('');

    const initialForm = {
        name: '',
        sku: '',
        brand: '',
        category: '',
        cartonSize: 1,
        status: 'ACTIVE',
        weight: 0,
        cartonWeight: 0,
        // Prices are held per country and never converted between them —
        // { [countryId]: { price, wholesaleCost } }, blank meaning unpriced.
        countryPrices: {},
        dimensions: { length: 0, breadth: 0, height: 0 }
    };
    const [formData, setFormData] = useState(initialForm);

    useEffect(() => {
        setPage(1); // Reset to page 1 when filter changes
    }, [filterBrand, filterCategory]);

    useEffect(() => {
        if (!activeCountry?._id) return;
        fetchData();
    }, [filterBrand, filterCategory, page, activeCountry?._id]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const brandQuery = filterBrand ? `&brandId=${filterBrand}` : '';
            const categoryQuery = filterCategory ? `&categoryId=${filterCategory}` : '';
            const [productsRes, brandsRes, categoriesRes] = await Promise.all([
                // includeUnpriced keeps products with no price in this country
                // visible here, so an admin can give them one.
                api.get(
                    `/products?page=${page}&limit=20${brandQuery}${categoryQuery}` +
                    `&countryId=${activeCountry._id}&includeUnpriced=true`
                ),
                api.get('/brands'),
                api.get('/categories')
            ]);
            setProducts(productsRes.data.data);
            setPagination(productsRes.data.pagination);
            setBrands(brandsRes.data.data);
            setCategories(categoriesRes.data.data);
            setLoading(false);
        } catch (err) {
            toast.error('Failed to load data');
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            // Only countries given a price are sent; the rest stay unpriced
            // and the product cannot be ordered there.
            const countryPrices = Object.entries(formData.countryPrices || {})
                .filter(([, v]) => v && v.price !== '' && v.price !== null && v.price !== undefined)
                .map(([countryId, v]) => ({
                    countryId,
                    price: Number(v.price) || 0,
                    wholesaleCost: Number(v.wholesaleCost) || 0,
                }));

            // Convert dimensions from cm to m for backend
            const payload = {
                ...formData,
                countryPrices,
                dimensions: {
                    length: (formData.dimensions?.length || 0) / 100,
                    breadth: (formData.dimensions?.breadth || 0) / 100,
                    height: (formData.dimensions?.height || 0) / 100
                }
            };
            if (editingProduct) {
                await api.put(`/products/${editingProduct._id}`, payload);
            } else {
                await api.post('/products', payload);
            }
            fetchData();
            closeModal();
            toast.success('Product saved successfully');
        } catch (err) {
            const errorMsg = err.response?.data?.errors?.[0]?.msg
                || (Array.isArray(err.response?.data?.message) ? err.response?.data?.message[0] : err.response?.data?.message)
                || 'Operation failed';
            toast.error(errorMsg);
        }
    };

    const openModal = (product = null) => {
        if (product) {
            setEditingProduct(product);
            setFormData({
                name: product.name,
                sku: product.sku,
                brand: product.brand._id || product.brand,
                category: product.category?._id || product.category || '',
                cartonSize: product.cartonSize,
                status: product.status,
                weight: product.weight || 0,
                cartonWeight: (product.weight || 0) * (product.cartonSize || 1),
                countryPrices: (product.countryPrices || []).reduce((acc, cp) => {
                    const id = cp.countryId?._id || cp.countryId;
                    acc[id] = {
                        price: cp.price ?? '',
                        wholesaleCost: cp.wholesaleCost ?? '',
                    };
                    return acc;
                }, {}),
                dimensions: product.dimensions ? {
                    length: (product.dimensions.length || 0) * 100,
                    breadth: (product.dimensions.breadth || 0) * 100,
                    height: (product.dimensions.height || 0) * 100
                } : { length: 0, breadth: 0, height: 0 }
            });
        } else {
            setEditingProduct(null);
            setFormData(initialForm);
        }
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingProduct(null);
        setFormData(initialForm);
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this product?')) {
            try {
                await api.delete(`/products/${id}`);
                fetchData();
                toast.success('Product deleted');
            } catch (err) {
                toast.error('Failed to delete product');
            }
        }
    };

    // Prepare export data
    const getExportData = () => {
        return products.map(product => ({
            sku: product.sku || '',
            name: product.name || '',
            brand: product.brand?.name || '',
            category: product.category?.name || '',
            cartonSize: product.cartonSize || 0,
            weight: product.weight || 0,
            wholesaleCost: product.wholesaleCost == null ? '' : parseFloat(product.wholesaleCost.toFixed(2)),
            price: product.price == null ? '' : parseFloat(product.price.toFixed(2)),
            length: product.dimensions?.length || 0,
            breadth: product.dimensions?.breadth || 0,
            height: product.dimensions?.height || 0,
            status: product.status || ''
        }));
    };

    const exportColumns = [
        { key: 'sku', label: 'SKU' },
        { key: 'name', label: 'Product Name' },
        { key: 'brand', label: 'Brand' },
        { key: 'category', label: 'Category' },
        { key: 'cartonSize', label: 'Carton Size' },
        { key: 'weight', label: 'Weight (kg)' },
        { key: 'wholesaleCost', label: `Wholesale Cost (${symbol})` },
        { key: 'price', label: `Price (${symbol})` },
        { key: 'length', label: 'Length (m)' },
        { key: 'breadth', label: 'Breadth (m)' },
        { key: 'height', label: 'Height (m)' },
        { key: 'status', label: 'Status' }
    ];

    return (
        <div className="page-container">
            <div className="page-header">
                <h1>Product Management</h1>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {products.length > 0 && (
                        <ExportButton
                            data={getExportData()}
                            columns={exportColumns}
                            filename={`products-${new Date().toISOString().split('T')[0]}`}
                            label="Export"
                        />
                    )}
                    <PermissionGuard permission={PERMISSIONS.MANAGE_INVENTORY}>
                        <button onClick={() => openModal()} className="btn btn-primary">
                            <FiPlus /> Add Product
                        </button>
                    </PermissionGuard>
                </div>
            </div>

            <div className="filters">
                <select
                    value={filterBrand}
                    onChange={(e) => setFilterBrand(e.target.value)}
                    className="filter-select"
                >
                    <option value="">All Brands</option>
                    {brands.map(b => (
                        <option key={b._id} value={b._id}>{b.name}</option>
                    ))}
                </select>
                <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="filter-select"
                >
                    <option value="">All Categories</option>
                    {categories.map(c => (
                        <option key={c._id} value={c._id}>{c.name}</option>
                    ))}
                </select>
            </div>



            {loading ? (
                <Spinner fullPage />
            ) : (
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th style={{ width: '120px' }}>SKU</th>
                                <th>Name</th>
                                <th>Brand</th>
                                <th>Category</th>
                                <th>Wholesale & Price</th>
                                <th>Dimensions (cm)</th>
                                <th>Weight</th>
                                <th>Carton Size</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {products.map((product) => (
                                <tr key={product._id}>
                                    <td className="font-mono text-xs" style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{product.sku}</td>
                                    <td>{product.name}</td>
                                    <td>{product.brand?.name || 'Unknown'}</td>
                                    <td>
                                        <span className="text-muted">
                                            {product.category?.name || '-'}
                                        </span>
                                    </td>
                                    <td>
                                        {product.isPriced ? (
                                            <>
                                                <div style={{ fontSize: '0.8rem', color: '#6B7A99' }}>Cost: {format(product.wholesaleCost)}</div>
                                                <div style={{ fontWeight: 600, color: '#111827' }}>Price: {format(product.price)}</div>
                                            </>
                                        ) : (
                                            <span
                                                style={{
                                                    fontSize: '0.75rem',
                                                    fontWeight: 600,
                                                    color: '#B45309',
                                                    background: '#FEF3C7',
                                                    border: '1px solid #FDE68A',
                                                    borderRadius: '6px',
                                                    padding: '2px 8px',
                                                    whiteSpace: 'nowrap',
                                                }}
                                                title={`Set a price for ${activeCountry?.name} to sell this product there`}
                                            >
                                                Not priced in {activeCountry?.name}
                                            </span>
                                        )}
                                    </td>
                                    <td className="text-secondary">
                                        {product.dimensions ? (
                                            `${Math.round(product.dimensions.length * 100)}, ${Math.round(product.dimensions.breadth * 100)}, ${Math.round(product.dimensions.height * 100)}`
                                        ) : '-'}
                                    </td>
                                    <td>{product.weight?.toFixed(2) || '0.00'} kg</td>
                                    <td>{product.cartonSize}</td>
                                    <td>
                                        <span className={`status-badge ${product.status.toLowerCase()}`}>
                                            {product.status}
                                        </span>
                                    </td>
                                    <td>
                                        <PermissionGuard permission={PERMISSIONS.MANAGE_INVENTORY}>
                                            <div className="action-buttons">
                                                <button onClick={() => openModal(product)} className="btn-icon" title="Edit Product"><FiEdit2 /></button>
                                                <button onClick={() => handleDelete(product._id)} className="btn-icon delete" title="Delete Product"><FiTrash2 /></button>
                                            </div>
                                        </PermissionGuard>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {!loading && pagination?.totalPages > 1 && (
                <div className="pagination">
                    <button
                        className="btn btn-sm btn-secondary"
                        disabled={page === 1}
                        onClick={() => setPage(p => p - 1)}
                    >
                        Previous
                    </button>
                    <div className="page-info">
                        Page <strong>{page}</strong> of <strong>{pagination.totalPages}</strong>
                        <span className="text-secondary ml-sm">({pagination.total} products)</span>
                    </div>
                    <button
                        className="btn btn-sm btn-secondary"
                        disabled={page === pagination.totalPages}
                        onClick={() => setPage(p => p + 1)}
                    >
                        Next
                    </button>
                </div>
            )}

            {/* Modal */}
            {isModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h2>{editingProduct ? 'Edit Product' : 'New Product'}</h2>
                            <button onClick={closeModal} className="btn-close" title="Close"><FiX /></button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label>SKU (Unique)</label>
                                <input
                                    type="text"
                                    value={formData.sku}
                                    onChange={(e) => setFormData({ ...formData, sku: e.target.value.toUpperCase() })}
                                    placeholder="e.g., SAM-S24-BLK"
                                />
                            </div>
                            <div className="form-group">
                                <label>Product Name</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Brand</label>
                                <select
                                    value={formData.brand}
                                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                                    required
                                >
                                    <option value="">Select Brand</option>
                                    {brands.filter(b => b.active).map(b => (
                                        <option key={b._id} value={b._id}>{b.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group">
                                <label>Category (Optional)</label>
                                <select
                                    value={formData.category}
                                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                >
                                    <option value="">No Category</option>
                                    {categories.filter(c => c.active).map(c => (
                                        <option key={c._id} value={c._id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group">
                                <label>Carton Size (Pieces per Carton)</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={formData.cartonSize}
                                    onChange={(e) => {
                                        const newSize = parseInt(e.target.value) || 0;
                                        setFormData({
                                            ...formData,
                                            cartonSize: newSize,
                                            // Update carton weight display based on constant piece weight
                                            cartonWeight: (formData.weight * newSize)
                                        });
                                    }}
                                    onWheel={(e) => e.target.blur()}
                                    required
                                />
                                <small className="form-help-text">Mandatory. Cannot change if orders exist.</small>
                            </div>



                            <div className="form-group">
                                <label style={{ marginBottom: '4px' }}>Pricing by country (per piece)</label>
                                <p style={{ fontSize: '0.78rem', color: '#6B7A99', margin: '0 0 10px' }}>
                                    Each country is priced in its own currency — no conversion is applied.
                                    Leave a country blank to leave the product unavailable to order there.
                                </p>

                                <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                                    {availableCountries.map((country, index) => {
                                        const entry = formData.countryPrices?.[country._id] || {};
                                        const countrySymbol = currencyOf(country).symbol;

                                        const setField = (field, value) =>
                                            setFormData({
                                                ...formData,
                                                countryPrices: {
                                                    ...formData.countryPrices,
                                                    [country._id]: { ...entry, [field]: value },
                                                },
                                            });

                                        return (
                                            <div
                                                key={country._id}
                                                style={{
                                                    display: 'grid',
                                                    gridTemplateColumns: '1.1fr 1fr 1fr',
                                                    gap: '10px',
                                                    alignItems: 'center',
                                                    padding: '10px 12px',
                                                    background: index % 2 ? '#F8FAFC' : '#fff',
                                                    borderTop: index ? '1px solid #EEF2F7' : 'none',
                                                }}
                                            >
                                                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1E293B' }}>
                                                    {country.name}
                                                    <span style={{ marginLeft: '6px', fontWeight: 500, color: '#64748B' }}>
                                                        ({country.currencyCode})
                                                    </span>
                                                </div>

                                                <label style={{ display: 'block', margin: 0 }}>
                                                    <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                                        Wholesale cost ({countrySymbol})
                                                    </span>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        placeholder="0.00"
                                                        value={entry.wholesaleCost ?? ''}
                                                        onChange={(e) => setField('wholesaleCost', e.target.value)}
                                                        onWheel={(e) => e.target.blur()}
                                                    />
                                                </label>

                                                <label style={{ display: 'block', margin: 0 }}>
                                                    <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                                        Retail price ({countrySymbol})
                                                    </span>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        placeholder="Not priced"
                                                        value={entry.price ?? ''}
                                                        onChange={(e) => setField('price', e.target.value)}
                                                        onWheel={(e) => e.target.blur()}
                                                    />
                                                </label>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Carton Weight (kg)</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={formData.cartonWeight}
                                    onChange={(e) => {
                                        const newCartonWeight = e.target.value; // Keep as string to allow decimals
                                        const pieceWeight = formData.cartonSize > 0 ? (parseFloat(newCartonWeight) || 0) / formData.cartonSize : 0;
                                        setFormData({
                                            ...formData,
                                            cartonWeight: newCartonWeight,
                                            weight: pieceWeight
                                        });
                                    }}
                                    onWheel={(e) => e.target.blur()}
                                />
                                <small className="form-help-text">
                                    Estimated weight per piece: {(formData.weight || 0).toFixed(2)} kg
                                </small>
                            </div>

                            <div className="form-group">
                                <label>Carton Dimensions (Centimeters)</label>
                                <div className="dimensions-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' }}>
                                    <div>
                                        <label style={{ fontSize: '0.75em', marginBottom: '2px', display: 'block' }}>Length (cm)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.1"
                                            value={formData.dimensions?.length || ''}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                dimensions: { ...formData.dimensions, length: e.target.value }
                                            })}
                                            onWheel={(e) => e.target.blur()}
                                            style={{ width: '100%' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.75em', marginBottom: '2px', display: 'block' }}>Breadth (cm)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.1"
                                            value={formData.dimensions?.breadth || ''}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                dimensions: { ...formData.dimensions, breadth: e.target.value }
                                            })}
                                            onWheel={(e) => e.target.blur()}
                                            style={{ width: '100%' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.75em', marginBottom: '2px', display: 'block' }}>Height (cm)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.1"
                                            value={formData.dimensions?.height || ''}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                dimensions: { ...formData.dimensions, height: e.target.value }
                                            })}
                                            onWheel={(e) => e.target.blur()}
                                            style={{ width: '100%' }}
                                        />
                                    </div>
                                </div>
                                <div className="text-sm mt-xs text-secondary">
                                    Calculated Volume: {
                                        ((parseFloat(formData.dimensions?.length) || 0) *
                                            (parseFloat(formData.dimensions?.breadth) || 0) *
                                            (parseFloat(formData.dimensions?.height) || 0) / 1000000).toFixed(4)
                                    } m³
                                </div>
                            </div>
                            <div className="form-group form-group-row">
                                <label>Status</label>
                                <select
                                    value={formData.status}
                                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                >
                                    <option value="ACTIVE">Active</option>
                                    <option value="INACTIVE">Inactive</option>
                                    <option value="DISCONTINUED">Discontinued</option>
                                </select>
                            </div>
                            <div className="modal-actions">
                                <button type="button" onClick={closeModal} className="btn btn-secondary">Cancel</button>
                                <button type="submit" className="btn btn-primary">Save</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Products;
