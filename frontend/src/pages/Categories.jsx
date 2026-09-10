import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { FiEdit2, FiTrash2, FiPlus, FiX, FiPackage } from 'react-icons/fi';
import api from '../utils/api';
import Spinner from '../components/Spinner';
import PermissionGuard from '../components/PermissionGuard';
import { PERMISSIONS } from '../utils/constants';
import ExportButton from '../components/ExportButton';
import useCurrency from '../hooks/useCurrency';

const Categories = () => {
    const { symbol } = useCurrency();
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState(null);
    const [formData, setFormData] = useState({ name: '', description: '', active: true });
    const [viewingProducts, setViewingProducts] = useState(null);
    const [categoryProducts, setCategoryProducts] = useState([]);
    const [loadingProducts, setLoadingProducts] = useState(false);

    useEffect(() => {
        fetchCategories();
    }, []);

    const fetchCategories = async () => {
        try {
            const res = await api.get('/categories');
            setCategories(res.data.data);
            setLoading(false);
        } catch (err) {
            toast.error('Failed to load categories');
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingCategory) {
                await api.put(`/categories/${editingCategory._id}`, formData);
            } else {
                await api.post('/categories', formData);
            }
            fetchCategories();
            closeModal();
            toast.success('Category saved successfully');
        } catch (err) {
            toast.error(err.response?.data?.errors?.[0]?.msg || 'Operation failed');
        }
    };

    const openModal = (category = null) => {
        if (category) {
            setEditingCategory(category);
            setFormData({ 
                name: category.name, 
                description: category.description || '',
                active: category.active 
            });
        } else {
            setEditingCategory(null);
            setFormData({ name: '', description: '', active: true });
        }
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingCategory(null);
        setFormData({ name: '', description: '', active: true });
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this category?')) {
            try {
                await api.delete(`/categories/${id}`);
                fetchCategories();
                toast.success('Category deleted');
            } catch (err) {
                toast.error('Failed to delete category');
            }
        }
    };

    const viewProducts = async (category) => {
        setViewingProducts(category);
        setLoadingProducts(true);
        try {
            const res = await api.get(`/categories/${category._id}/products`);
            setCategoryProducts(res.data.data);
        } catch (err) {
            toast.error('Failed to load products');
            setCategoryProducts([]);
        } finally {
            setLoadingProducts(false);
        }
    };

    const closeProductsModal = () => {
        setViewingProducts(null);
        setCategoryProducts([]);
    };

    // Prepare export data
    const getExportData = () => {
        return categories.map(category => ({
            name: category.name || '',
            description: category.description || '',
            status: category.active ? 'Active' : 'Inactive',
            productCount: category.productCount || 0,
            createdAt: new Date(category.createdAt).toLocaleDateString()
        }));
    };

    const exportColumns = [
        { key: 'name', label: 'Category Name' },
        { key: 'description', label: 'Description' },
        { key: 'status', label: 'Status' },
        { key: 'productCount', label: 'Product Count' },
        { key: 'createdAt', label: 'Created Date' }
    ];

    return (
        <div className="page-container">
            <div className="page-header">
                <h1>Category Management</h1>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {categories.length > 0 && (
                        <ExportButton
                            data={getExportData()}
                            columns={exportColumns}
                            filename={`categories-${new Date().toISOString().split('T')[0]}`}
                            label="Export"
                        />
                    )}
                    <PermissionGuard permission={PERMISSIONS.MANAGE_INVENTORY}>
                        <button onClick={() => openModal()} className="btn btn-primary">
                            <FiPlus style={{ marginRight: '0.5rem' }} /> Add Category
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
                                <th>Description</th>
                                <th>Status</th>
                                <th>Products</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {categories.map((category) => (
                                <tr key={category._id}>
                                    <td>{category.name}</td>
                                    <td>
                                        <span className="text-muted">
                                            {category.description || 'No description'}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={`status-badge ${category.active ? 'active' : 'inactive'}`}>
                                            {category.active ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td>
                                        <button
                                            onClick={() => viewProducts(category)}
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
                                                    onClick={() => openModal(category)}
                                                    className="btn-icon"
                                                    title="Edit"
                                                >
                                                    <FiEdit2 />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(category._id)}
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

            {/* Modal */}
            {isModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h2>{editingCategory ? 'Edit Category' : 'New Category'}</h2>
                            <button onClick={closeModal} className="btn-close" title="Close"><FiX /></button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label>Category Name</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Description (Optional)</label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    rows="3"
                                    placeholder="Brief description of this category"
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
                            ) : categoryProducts.length === 0 ? (
                                <div style={{ 
                                    textAlign: 'center', 
                                    padding: '3rem 1rem',
                                    color: '#64748B'
                                }}>
                                    <FiPackage size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                                    <p style={{ fontSize: '1rem', fontWeight: 500 }}>No products in this category</p>
                                    <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                                        Products can be assigned to this category from the Products page
                                    </p>
                                </div>
                            ) : (
                                <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>SKU</th>
                                                <th>Product Name</th>
                                                <th>Brand</th>
                                                <th>Price</th>
                                                {/* <th>Status</th> */}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {categoryProducts.map((product) => (
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
                                                    <td>{product.brand?.name || 'N/A'}</td>
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
                                        Total: {categoryProducts.length} product{categoryProducts.length !== 1 ? 's' : ''}
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

export default Categories;
