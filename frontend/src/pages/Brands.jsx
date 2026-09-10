import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { FiEdit2, FiTrash2, FiPlus, FiX, FiPackage } from 'react-icons/fi';
import api from '../utils/api';
import Spinner from '../components/Spinner';
import PermissionGuard from '../components/PermissionGuard';
import { PERMISSIONS } from '../utils/constants';
import ExportButton from '../components/ExportButton';
import useCurrency from '../hooks/useCurrency';

const Brands = () => {
    const { symbol } = useCurrency();
    const [brands, setBrands] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingBrand, setEditingBrand] = useState(null);
    const [formData, setFormData] = useState({ name: '', active: true });
    const [viewingProducts, setViewingProducts] = useState(null);
    const [brandProducts, setBrandProducts] = useState([]);
    const [loadingProducts, setLoadingProducts] = useState(false);

    useEffect(() => {
        fetchBrands();
    }, []);

    const fetchBrands = async () => {
        try {
            const res = await api.get('/brands');
            setBrands(res.data.data);
            setLoading(false);
        } catch (err) {
            toast.error('Failed to load brands');
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingBrand) {
                await api.put(`/brands/${editingBrand._id}`, formData);
            } else {
                await api.post('/brands', formData);
            }
            fetchBrands();
            closeModal();
            toast.success('Brand saved successfully');
        } catch (err) {
            toast.error(err.response?.data?.errors?.[0]?.msg || 'Operation failed');
        }
    };

    const openModal = (brand = null) => {
        if (brand) {
            setEditingBrand(brand);
            setFormData({ name: brand.name, active: brand.active });
        } else {
            setEditingBrand(null);
            setFormData({ name: '', active: true });
        }
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingBrand(null);
        setFormData({ name: '', active: true });
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this brand?')) {
            try {
                await api.delete(`/brands/${id}`);
                fetchBrands();
                toast.success('Brand deleted');
            } catch (err) {
                toast.error('Failed to delete brand');
            }
        }
    };

    const viewProducts = async (brand) => {
        setViewingProducts(brand);
        setLoadingProducts(true);
        try {
            const res = await api.get(`/brands/${brand._id}/products`);
            setBrandProducts(res.data.data);
        } catch (err) {
            toast.error('Failed to load products');
            setBrandProducts([]);
        } finally {
            setLoadingProducts(false);
        }
    };

    const closeProductsModal = () => {
        setViewingProducts(null);
        setBrandProducts([]);
    };

    // Prepare export data
    const getExportData = () => {
        return brands.map(brand => ({
            name: brand.name || '',
            status: brand.active ? 'Active' : 'Inactive',
            productCount: brand.productCount || 0,
            createdAt: new Date(brand.createdAt).toLocaleDateString()
        }));
    };

    const exportColumns = [
        { key: 'name', label: 'Brand Name' },
        { key: 'status', label: 'Status' },
        { key: 'productCount', label: 'Product Count' },
        { key: 'createdAt', label: 'Created Date' }
    ];

    return (
        <div className="page-container">
            <div className="page-header">
                <h1>Brand Management</h1>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {brands.length > 0 && (
                        <ExportButton
                            data={getExportData()}
                            columns={exportColumns}
                            filename={`brands-${new Date().toISOString().split('T')[0]}`}
                            label="Export"
                        />
                    )}
                    <PermissionGuard permission={PERMISSIONS.MANAGE_INVENTORY}>
                        <button onClick={() => openModal()} className="btn btn-primary">
                            <FiPlus style={{ marginRight: '0.5rem' }} /> Add Brand
                        </button>
                    </PermissionGuard>
                </div>
            </div>



            {loading ? (
                <Spinner fullPage />
            ) : (
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Status</th>
                                <th>Products</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {brands.map((brand) => (
                                <tr key={brand._id}>
                                    <td>{brand.name}</td>
                                    <td>
                                        <span className={`status-badge ${brand.active ? 'active' : 'inactive'}`}>
                                            {brand.active ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td>
                                        <button
                                            onClick={() => viewProducts(brand)}
                                            className="btn-icon"
                                            title="View Products"
                                            style={{ 
                                                color: '#4880FF',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                fontSize: '0.85rem'
                                            }}
                                        >
                                            <FiPackage /> View
                                        </button>
                                    </td>
                                    <td>
                                        <PermissionGuard permission={PERMISSIONS.MANAGE_INVENTORY}>
                                            <div className="action-buttons">
                                                <button
                                                    onClick={() => openModal(brand)}
                                                    className="btn-icon"
                                                    title="Edit"
                                                >
                                                    <FiEdit2 />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(brand._id)}
                                                    className="btn-icon delete"
                                                    title="Delete"
                                                >
                                                    <FiTrash2 />
                                                </button>
                                            </div>
                                        </PermissionGuard>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Simple Modal */}
            {isModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h2>{editingBrand ? 'Edit Brand' : 'New Brand'}</h2>
                            <button onClick={closeModal} className="btn-close" title="Close"><FiX /></button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label>Brand Name</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group checkbox-group">
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={formData.active}
                                        onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                                    />
                                    Active
                                </label>
                            </div>
                            <div className="modal-actions">
                                <button type="button" onClick={closeModal} className="btn btn-secondary">
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    Save
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Products Modal */}
            {viewingProducts && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '900px' }}>
                        <div className="modal-header">
                            <h2>
                                <FiPackage style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
                                Products in "{viewingProducts.name}"
                            </h2>
                            <button onClick={closeProductsModal} className="btn-close" title="Close"><FiX /></button>
                        </div>
                        <div style={{ padding: '1.5rem' }}>
                            {loadingProducts ? (
                                <div style={{ textAlign: 'center', padding: '2rem' }}>
                                    <Spinner />
                                </div>
                            ) : brandProducts.length === 0 ? (
                                <div style={{ 
                                    textAlign: 'center', 
                                    padding: '3rem 1rem',
                                    color: '#64748B'
                                }}>
                                    <FiPackage size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                                    <p style={{ fontSize: '1rem', fontWeight: 500 }}>No products for this brand</p>
                                    <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                                        Products can be assigned to this brand from the Products page
                                    </p>
                                </div>
                            ) : (
                                <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>SKU</th>
                                                <th>Product Name</th>
                                                <th>Category</th>
                                                <th>Price</th>
                                                {/* <th>Status</th> */}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {brandProducts.map((product) => (
                                                <tr key={product._id}>
                                                    <td>
                                                        <span style={{ 
                                                            fontFamily: 'monospace',
                                                            fontSize: '0.85rem',
                                                            color: '#64748B'
                                                        }}>
                                                            {product.sku}
                                                        </span>
                                                    </td>
                                                    <td style={{ fontWeight: 500 }}>{product.name}</td>
                                                    <td>{product.category?.name || 'N/A'}</td>
                                                    <td style={{ fontWeight: 600 }}>
                                                        {symbol}{product.price?.toLocaleString() || '0'}
                                                    </td>
                                                    {/* <td>
                                                        <span className={`status-badge ${product.active ? 'active' : 'inactive'}`}>
                                                            {product.active ? 'Active' : 'Inactive'}
                                                        </span>
                                                    </td> */}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    <div style={{ 
                                        marginTop: '1rem', 
                                        padding: '0.75rem',
                                        background: '#F8FAFC',
                                        borderRadius: '6px',
                                        fontSize: '0.875rem',
                                        color: '#64748B'
                                    }}>
                                        Total: {brandProducts.length} product{brandProducts.length !== 1 ? 's' : ''}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Brands;
