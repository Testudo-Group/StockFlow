import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FiPlus, FiEdit2, FiEye, FiSearch, FiX } from 'react-icons/fi';
import api from '../../utils/api';
import Spinner from '../../components/Spinner';
import { useCountry } from '../../context/CountryContext';
import useCurrency from '../../hooks/useCurrency';

const LIMIT = 20;

const initialForm = {
    name: '',
    phone: '',
    address: '',
    email: '',
    notes: '',
};

const SORCustomers = () => {
    const navigate = useNavigate();
    const { activeCountry } = useCountry();
    const { format } = useCurrency();
    const formatCurrency = (amount) => format(Number(amount || 0));

    // List state
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({ totalPages: 1, total: 0 });
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState(null);
    const [formData, setFormData] = useState(initialForm);
    const [formErrors, setFormErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);

    // Debounce search input
    useEffect(() => {
        const timer = setTimeout(() => {
            setSearch(searchInput);
            setPage(1);
        }, 400);
        return () => clearTimeout(timer);
    }, [searchInput]);

    const fetchCustomers = useCallback(async () => {
        if (!activeCountry?._id) return;
        setLoading(true);
        try {
            const params = new URLSearchParams({ page, limit: LIMIT });
            if (search) params.append('search', search);
            params.append('countryId', activeCountry._id);
            const res = await api.get(`/sor/customers?${params.toString()}`);
            setCustomers(res.data.data);
            setPagination(res.data.pagination || { totalPages: 1, total: res.data.data.length });
        } catch (err) {
            toast.error('Failed to load SOR customers');
        } finally {
            setLoading(false);
        }
    }, [page, search]);

    useEffect(() => {
        fetchCustomers();
    }, [fetchCustomers, activeCountry?._id]);

    // --- Modal helpers ---
    const openModal = (customer = null) => {
        if (customer) {
            setEditingCustomer(customer);
            setFormData({
                name: customer.name || '',
                phone: customer.phone || '',
                address: customer.address || '',
                email: customer.email || '',
                notes: customer.notes || '',
            });
        } else {
            setEditingCustomer(null);
            setFormData(initialForm);
        }
        setFormErrors({});
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingCustomer(null);
        setFormData(initialForm);
        setFormErrors({});
    };

    // --- Validation ---
    const validate = () => {
        const errors = {};
        if (!formData.name.trim()) errors.name = 'Name is required';
        if (!formData.phone.trim()) errors.phone = 'Phone is required';
        if (!formData.address.trim()) errors.address = 'Address is required';
        return errors;
    };

    // --- Submit ---
    const handleSubmit = async (e) => {
        e.preventDefault();
        const errors = validate();
        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            return;
        }
        setSubmitting(true);
        try {
            const payload = {
                name: formData.name.trim(),
                phone: formData.phone.trim(),
                address: formData.address.trim(),
                ...(formData.email.trim() && { email: formData.email.trim() }),
                ...(formData.notes.trim() && { notes: formData.notes.trim() }),
                ...(activeCountry?._id && { countryId: activeCountry._id }),
            };
            if (editingCustomer) {
                await api.put(`/sor/customers/${editingCustomer._id}`, payload);
                toast.success('Customer updated');
            } else {
                await api.post('/sor/customers', payload);
                toast.success('Customer created');
            }
            closeModal();
            fetchCustomers();
        } catch (err) {
            const msg = err.response?.data?.message || 'Operation failed';
            toast.error(msg);
        } finally {
            setSubmitting(false);
        }
    };

    const handleFieldChange = (field, value) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
        if (formErrors[field]) {
            setFormErrors((prev) => ({ ...prev, [field]: undefined }));
        }
    };

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1>SOR Customers</h1>
                    <p>Sales on Return — manage credit customers and their outstanding liabilities</p>
                </div>
                <button onClick={() => openModal()} className="btn btn-primary">
                    <FiPlus style={{ marginRight: '0.4rem' }} /> Add Customer
                </button>
            </div>

            {/* Search bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <div style={{ position: 'relative', flex: '1', maxWidth: '360px' }}>
                    <FiSearch style={{
                        position: 'absolute', left: '10px', top: '50%',
                        transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none'
                    }} />
                    <input
                        type="text"
                        placeholder="Search by name or phone..."
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        style={{
                            paddingLeft: '32px', paddingRight: '32px',
                            padding: '8px 32px',
                            border: '1px solid #E2E8F0', borderRadius: '6px',
                            width: '100%', fontSize: '0.9rem'
                        }}
                    />
                    {searchInput && (
                        <button
                            onClick={() => setSearchInput('')}
                            style={{
                                position: 'absolute', right: '8px', top: '50%',
                                transform: 'translateY(-50%)', background: 'none',
                                border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 0
                            }}
                        >
                            <FiX size={14} />
                        </button>
                    )}
                </div>
                {pagination.total > 0 && (
                    <span style={{ fontSize: '0.85rem', color: '#64748B' }}>
                        {pagination.total} customer{pagination.total !== 1 ? 's' : ''}
                    </span>
                )}
            </div>

            {loading ? (
                <Spinner fullPage />
            ) : (
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Phone</th>
                                <th>Address</th>
                                <th>Outstanding Liability</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {customers.length === 0 ? (
                                <tr>
                                    <td colSpan={5} style={{ textAlign: 'center', padding: '2.5rem', color: '#64748B' }}>
                                        {search ? `No customers match "${search}"` : 'No SOR customers yet. Add one to get started.'}
                                    </td>
                                </tr>
                            ) : (
                                customers.map((customer) => {
                                    const liability = customer.outstandingLiability ?? 0;
                                    const isSettled = liability <= 0;
                                    return (
                                        <tr key={customer._id}>
                                            <td style={{ fontWeight: 500 }}>{customer.name}</td>
                                            <td>{customer.phone}</td>
                                            <td style={{ maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {customer.address}
                                            </td>
                                            <td>
                                                {isSettled ? (
                                                    <span style={{
                                                        display: 'inline-block',
                                                        padding: '2px 10px',
                                                        borderRadius: '99px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 600,
                                                        background: '#dcfce7',
                                                        color: '#166534'
                                                    }}>
                                                        Settled
                                                    </span>
                                                ) : (
                                                    <span style={{ fontWeight: 600, color: '#DC2626' }}>
                                                        {formatCurrency(liability)}
                                                    </span>
                                                )}
                                            </td>
                                            <td>
                                                <div className="action-buttons">
                                                    <button
                                                        onClick={() => navigate(`/sor/customers/${customer._id}`)}
                                                        className="btn-icon"
                                                        title="View Detail"
                                                    >
                                                        <FiEye />
                                                    </button>
                                                    <button
                                                        onClick={() => openModal(customer)}
                                                        className="btn-icon"
                                                        title="Edit"
                                                    >
                                                        <FiEdit2 />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Pagination */}
            {!loading && pagination.totalPages > 1 && (
                <div className="pagination">
                    <button
                        className="btn btn-sm btn-secondary"
                        disabled={page === 1}
                        onClick={() => setPage((p) => p - 1)}
                    >
                        Previous
                    </button>
                    <div className="page-info">
                        Page <strong>{page}</strong> of <strong>{pagination.totalPages}</strong>
                        <span className="text-secondary ml-sm">({pagination.total} customers)</span>
                    </div>
                    <button
                        className="btn btn-sm btn-secondary"
                        disabled={page === pagination.totalPages}
                        onClick={() => setPage((p) => p + 1)}
                    >
                        Next
                    </button>
                </div>
            )}

            {/* Create / Edit Modal */}
            {isModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '520px' }}>
                        <div className="modal-header">
                            <h2>{editingCustomer ? 'Edit Customer' : 'New SOR Customer'}</h2>
                            <button onClick={closeModal} className="btn-close" title="Close"><FiX /></button>
                        </div>
                        <form onSubmit={handleSubmit} noValidate>
                            <div className="form-group">
                                <label>Full Name <span style={{ color: '#DC2626' }}>*</span></label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => handleFieldChange('name', e.target.value)}
                                    placeholder="e.g. Amina Bello"
                                    style={formErrors.name ? { borderColor: '#DC2626' } : {}}
                                />
                                {formErrors.name && (
                                    <small style={{ color: '#DC2626' }}>{formErrors.name}</small>
                                )}
                            </div>

                            <div className="form-group">
                                <label>Phone <span style={{ color: '#DC2626' }}>*</span></label>
                                <input
                                    type="tel"
                                    value={formData.phone}
                                    onChange={(e) => handleFieldChange('phone', e.target.value)}
                                    placeholder="e.g. 08012345678"
                                    style={formErrors.phone ? { borderColor: '#DC2626' } : {}}
                                />
                                {formErrors.phone && (
                                    <small style={{ color: '#DC2626' }}>{formErrors.phone}</small>
                                )}
                            </div>

                            <div className="form-group">
                                <label>Address <span style={{ color: '#DC2626' }}>*</span></label>
                                <textarea
                                    value={formData.address}
                                    onChange={(e) => handleFieldChange('address', e.target.value)}
                                    placeholder="e.g. 12 Market Road, Kano"
                                    rows={2}
                                    style={{
                                        resize: 'vertical',
                                        ...(formErrors.address ? { borderColor: '#DC2626' } : {})
                                    }}
                                />
                                {formErrors.address && (
                                    <small style={{ color: '#DC2626' }}>{formErrors.address}</small>
                                )}
                            </div>

                            <div className="form-group">
                                <label>Email <span style={{ color: '#94A3B8', fontSize: '0.8rem' }}>(optional)</span></label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => handleFieldChange('email', e.target.value)}
                                    placeholder="e.g. amina@example.com"
                                />
                            </div>

                            <div className="form-group">
                                <label>Notes <span style={{ color: '#94A3B8', fontSize: '0.8rem' }}>(optional)</span></label>
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => handleFieldChange('notes', e.target.value)}
                                    placeholder="Any additional notes about this customer..."
                                    rows={2}
                                    style={{ resize: 'vertical' }}
                                />
                            </div>

                            <div className="modal-actions">
                                <button type="button" onClick={closeModal} className="btn btn-secondary" disabled={submitting}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={submitting}>
                                    {submitting ? 'Saving...' : editingCustomer ? 'Save Changes' : 'Create Customer'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SORCustomers;
