import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
    FiArrowLeft, FiEdit2, FiTrash2, FiPlus, FiDownload, FiX, FiCheck,
    FiAlertTriangle, FiDollarSign, FiShoppingCart, FiCreditCard
} from 'react-icons/fi';
import api from '../../utils/api';
import Spinner from '../../components/Spinner';
import { useAuth } from '../../context/AuthContext';
import { ROLES } from '../../utils/constants';
import { useCountry } from '../../context/CountryContext';
import useCurrency from '../../hooks/useCurrency';

// ─── helpers ────────────────────────────────────────────────────────────────
const fmtDate = (d) =>
    d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// ─── sub-components ─────────────────────────────────────────────────────────

/** Reusable summary card */
const SummaryCard = ({ label, value, color, icon, badge }) => (
    <div style={{
        padding: '1.25rem 1.5rem',
        background: '#fff',
        borderRadius: '12px',
        border: '1px solid #E2E8F0',
        boxShadow: '0 1px 3px rgba(0,0,0,.06)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.4rem',
    }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748B', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {icon} {label}
        </div>
        <div style={{ fontSize: '1.6rem', fontWeight: 800, color: color || '#1E293B', lineHeight: 1 }}>
            {value}
        </div>
        {badge}
    </div>
);

/** Tab bar */
const TabBar = ({ tabs, active, onChange }) => (
    <div style={{
        display: 'flex', gap: '0.25rem', borderBottom: '2px solid #E2E8F0',
        marginBottom: '1.5rem', overflowX: 'auto',
    }}>
        {tabs.map((t) => (
            <button key={t.key} onClick={() => onChange(t.key)} style={{
                padding: '0.65rem 1.25rem', border: 'none', background: 'transparent',
                color: active === t.key ? '#4880FF' : '#64748B',
                fontWeight: active === t.key ? 700 : 500,
                fontSize: '0.9rem', cursor: 'pointer',
                borderBottom: active === t.key ? '2px solid #4880FF' : '2px solid transparent',
                marginBottom: '-2px', whiteSpace: 'nowrap',
            }}>
                {t.label}
            </button>
        ))}
    </div>
);

// ─── LEDGER PANEL ────────────────────────────────────────────────────────────
const LedgerPanel = ({ customerId }) => {
    const { format: fmt } = useCurrency();
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchLedger = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get(`/sor/customers/${customerId}/ledger`);
            setEntries(res.data.data || []);
        } catch {
            toast.error('Failed to load ledger');
        } finally {
            setLoading(false);
        }
    }, [customerId]);

    useEffect(() => { fetchLedger(); }, [fetchLedger]);

    const handleExport = async () => {
        try {
            const token = localStorage.getItem('token');
            const url = `${api.defaults.baseURL}/sor/customers/${customerId}/ledger/export?format=csv`;
            const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) throw new Error('Export failed');
            const blob = await res.blob();
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `sor-ledger-${customerId}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
            toast.success('Ledger exported');
        } catch {
            toast.error('Export failed');
        }
    };

    if (loading) return <Spinner />;

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#1E293B' }}>
                    Transaction Ledger
                </h3>
                <button onClick={handleExport} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                    <FiDownload size={14} /> Export CSV
                </button>
            </div>

            {entries.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#94A3B8' }}>No ledger entries yet.</div>
            ) : (
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Type</th>
                                <th>Reference</th>
                                <th style={{ textAlign: 'right' }}>Amount</th>
                                <th style={{ textAlign: 'right' }}>Running Balance</th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.map((e, i) => (
                                <tr key={i}>
                                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(e.date)}</td>
                                    <td>
                                        <span style={{
                                            padding: '2px 10px', borderRadius: '99px', fontSize: '0.72rem', fontWeight: 700,
                                            background: e.type === 'ORDER' ? '#DBEAFE' : '#D1FAE5',
                                            color: e.type === 'ORDER' ? '#1D4ED8' : '#065F46',
                                        }}>
                                            {e.type}
                                        </span>
                                    </td>
                                    <td style={{ color: '#475569', fontSize: '0.88rem' }}>{e.reference || '—'}</td>
                                    <td style={{ textAlign: 'right', fontWeight: 600, color: e.type === 'ORDER' ? '#DC2626' : '#10B981' }}>
                                        {e.type === 'ORDER' ? '+' : '-'}{fmt(Math.abs(e.amount))}
                                    </td>
                                    <td style={{ textAlign: 'right', fontWeight: 700, color: e.runningBalance <= 0 ? '#10B981' : '#1E293B' }}>
                                        {fmt(e.runningBalance)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

// ─── TEMPLATES PANEL ─────────────────────────────────────────────────────────
const emptyTemplate = { name: '', region: '', warehouse: '', items: [{ product: '', quantity: 1 }] };

const TemplatesPanel = ({ customerId, countryId }) => {
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(emptyTemplate);
    const [formErr, setFormErr] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [products, setProducts] = useState([]);
    const [regions, setRegions] = useState([]);
    const [warehouses, setWarehouses] = useState([]);

    const fetchTemplates = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get(`/sor/templates?customer=${customerId}`);
            setTemplates(res.data.data || []);
        } catch { toast.error('Failed to load templates'); }
        finally { setLoading(false); }
    }, [customerId]);

    useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

    useEffect(() => {
        if (!modalOpen) return;
        const countryParam = countryId ? `?countryId=${countryId}` : '';
        Promise.all([
            api.get(`/products?limit=500${countryParam ? `&countryId=${countryId}` : ''}`),
            api.get(`/regions${countryParam}`),
            api.get(`/warehouses${countryParam}`),
        ]).then(([p, r, w]) => {
            setProducts(p.data.data || []);
            setRegions(r.data.data || []);
            setWarehouses(w.data.data || []);
        }).catch(() => {});
    }, [modalOpen, countryId]);

    const openModal = (tpl = null) => {
        if (tpl) {
            setEditing(tpl);
            setForm({
                name: tpl.name || '',
                region: tpl.region?._id || tpl.region || '',
                warehouse: tpl.warehouse?._id || tpl.warehouse || '',
                items: tpl.items?.length
                    ? tpl.items.map((it) => ({ product: it.product?._id || it.product || '', quantity: it.quantity || 1 }))
                    : [{ product: '', quantity: 1 }],
            });
        } else {
            setEditing(null);
            setForm(emptyTemplate);
        }
        setFormErr({});
        setModalOpen(true);
    };

    const closeModal = () => { setModalOpen(false); setEditing(null); setForm(emptyTemplate); setFormErr({}); };

    const addItem = () => setForm((f) => ({ ...f, items: [...f.items, { product: '', quantity: 1 }] }));
    const removeItem = (i) => setForm((f) => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));
    const updateItem = (i, field, val) =>
        setForm((f) => ({ ...f, items: f.items.map((it, idx) => idx === i ? { ...it, [field]: val } : it) }));

    const validate = () => {
        const e = {};
        if (!form.name.trim()) e.name = 'Name is required';
        if (!form.region) e.region = 'Region is required';
        if (!form.warehouse) e.warehouse = 'Warehouse is required';
        if (!form.items.length || form.items.some((it) => !it.product))
            e.items = 'All items must have a product selected';
        if (form.items.length === 0) e.items = 'At least one item is required';
        return e;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const errs = validate();
        if (Object.keys(errs).length) { setFormErr(errs); return; }
        setSubmitting(true);
        try {
            const payload = { ...form, customer: customerId };
            if (editing) {
                await api.put(`/sor/templates/${editing._id}`, payload);
                toast.success('Template updated');
            } else {
                await api.post('/sor/templates', payload);
                toast.success('Template created');
            }
            closeModal();
            fetchTemplates();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Operation failed');
        } finally { setSubmitting(false); }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this template?')) return;
        try {
            await api.delete(`/sor/templates/${id}`);
            toast.success('Template deleted');
            fetchTemplates();
        } catch { toast.error('Delete failed'); }
    };

    if (loading) return <Spinner />;

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#1E293B' }}>Order Templates</h3>
                <button onClick={() => openModal()} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                    <FiPlus size={14} /> New Template
                </button>
            </div>

            {templates.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#94A3B8' }}>No templates yet. Create one to speed up order entry.</div>
            ) : (
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Items</th>
                                <th>Region</th>
                                <th>Warehouse</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {templates.map((t) => (
                                <tr key={t._id}>
                                    <td style={{ fontWeight: 500 }}>{t.name}</td>
                                    <td>{t.items?.length || 0} item{t.items?.length !== 1 ? 's' : ''}</td>
                                    <td>{t.region?.name || '—'}</td>
                                    <td>{t.warehouse?.name || '—'}</td>
                                    <td>
                                        <div className="action-buttons">
                                            <button onClick={() => openModal(t)} className="btn-icon" title="Edit"><FiEdit2 /></button>
                                            <button onClick={() => handleDelete(t._id)} className="btn-icon" title="Delete" style={{ color: '#DC2626' }}><FiTrash2 /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {modalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '560px' }}>
                        <div className="modal-header">
                            <h2>{editing ? 'Edit Template' : 'New Template'}</h2>
                            <button onClick={closeModal} className="btn-close"><FiX /></button>
                        </div>
                        <form onSubmit={handleSubmit} noValidate>
                            <div className="form-group">
                                <label>Template Name <span style={{ color: '#DC2626' }}>*</span></label>
                                <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                    placeholder="e.g. Weekly Restock" style={formErr.name ? { borderColor: '#DC2626' } : {}} />
                                {formErr.name && <small style={{ color: '#DC2626' }}>{formErr.name}</small>}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className="form-group">
                                    <label>Region <span style={{ color: '#DC2626' }}>*</span></label>
                                    <select value={form.region} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
                                        style={formErr.region ? { borderColor: '#DC2626' } : {}}>
                                        <option value="">Select region</option>
                                        {regions.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}
                                    </select>
                                    {formErr.region && <small style={{ color: '#DC2626' }}>{formErr.region}</small>}
                                </div>
                                <div className="form-group">
                                    <label>Warehouse <span style={{ color: '#DC2626' }}>*</span></label>
                                    <select value={form.warehouse} onChange={(e) => setForm((f) => ({ ...f, warehouse: e.target.value }))}
                                        style={formErr.warehouse ? { borderColor: '#DC2626' } : {}}>
                                        <option value="">Select warehouse</option>
                                        {warehouses.map((w) => <option key={w._id} value={w._id}>{w.name}</option>)}
                                    </select>
                                    {formErr.warehouse && <small style={{ color: '#DC2626' }}>{formErr.warehouse}</small>}
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Items <span style={{ color: '#DC2626' }}>*</span></label>
                                {form.items.map((item, i) => (
                                    <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                                        <select value={item.product} onChange={(e) => updateItem(i, 'product', e.target.value)}
                                            style={{ flex: 2, ...(formErr.items ? { borderColor: '#DC2626' } : {}) }}>
                                            <option value="">Select product</option>
                                            {products.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
                                        </select>
                                        <input type="number" min={1} value={item.quantity}
                                            onChange={(e) => updateItem(i, 'quantity', Number(e.target.value))}
                                            style={{ flex: 1, minWidth: '70px' }} placeholder="Qty" />
                                        {form.items.length > 1 && (
                                            <button type="button" onClick={() => removeItem(i)}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: '4px' }}>
                                                <FiX size={16} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                                {formErr.items && <small style={{ color: '#DC2626' }}>{formErr.items}</small>}
                                <button type="button" onClick={addItem}
                                    style={{ marginTop: '0.25rem', background: 'none', border: '1px dashed #CBD5E1', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', color: '#4880FF', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <FiPlus size={13} /> Add Item
                                </button>
                            </div>

                            <div className="modal-actions">
                                <button type="button" onClick={closeModal} className="btn btn-secondary" disabled={submitting}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={submitting}>
                                    {submitting ? 'Saving...' : editing ? 'Save Changes' : 'Create Template'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── PAYMENTS PANEL ──────────────────────────────────────────────────────────
const emptyPaymentItem = { product: '', quantity: '', price: '' };
const emptyPayment = { amount: '', paymentDate: new Date().toISOString().split('T')[0], referenceNote: '', items: [] };

const PaymentsPanel = ({ customerId, onPaymentRecorded }) => {
    const { user } = useAuth();
    const { activeCountry } = useCountry();
    const { format: fmt, symbol } = useCurrency();
    const isAdmin = user?.role === ROLES.ADMIN;

    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState(emptyPayment);
    const [formErr, setFormErr] = useState({});
    const [submitting, setSubmitting] = useState(false);
    // orderedProducts: [{ _id, name, price }] — unique products from customer's orders, most recent price
    const [orderedProducts, setOrderedProducts] = useState([]);
    // outstandingProducts: [{ _id, name, price, orderedQty, settledQty, outstandingQty }]
    const [outstandingProducts, setOutstandingProducts] = useState([]);
    const [expandedPayment, setExpandedPayment] = useState(null);
    const [outstandingRefresh, setOutstandingRefresh] = useState(0);

    // Overpayment confirmation dialog state
    const [confirmDialog, setConfirmDialog] = useState({ open: false, warning: '', pendingPayload: null });

    const fetchPayments = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get(`/sor/payments?customer=${customerId}`);
            setPayments(res.data.data || []);
        } catch { toast.error('Failed to load payments'); }
        finally { setLoading(false); }
    }, [customerId]);

    useEffect(() => { fetchPayments(); }, [fetchPayments]);

    // Derive ordered products + outstanding units from orders and payments
    useEffect(() => {
        Promise.all([
            api.get(`/sor/orders?customer=${customerId}`),
            api.get(`/sor/payments?customer=${customerId}`),
        ]).then(([ordersRes, paymentsRes]) => {
            const sorOrders = ordersRes.data.data || [];
            const allPayments = paymentsRes.data.data || [];

            // Build ordered qty per product (sum across all orders)
            const sorted = [...sorOrders].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            const productMap = new Map(); // pid → { _id, name, price, orderedQty }
            for (const so of sorted) {
                for (const item of so.order?.items || []) {
                    const pid = String(item.product?._id || item.product);
                    if (!pid) continue;
                    const existing = productMap.get(pid);
                    if (existing) {
                        existing.orderedQty += item.quantity || 0;
                        existing.price = item.price || existing.price; // keep most recent price
                    } else {
                        productMap.set(pid, {
                            _id: pid,
                            name: item.product?.name || pid,
                            price: item.price || 0,
                            orderedQty: item.quantity || 0,
                        });
                    }
                }
            }

            // Build settled qty per product (sum across all payment items)
            const settledMap = new Map(); // pid → settledQty
            for (const p of allPayments) {
                for (const it of p.items || []) {
                    const pid = String(it.product?._id || it.product);
                    if (!pid) continue;
                    settledMap.set(pid, (settledMap.get(pid) || 0) + (it.quantity || 0));
                }
            }

            // Compute outstanding
            const outstanding = [...productMap.values()].map((p) => ({
                ...p,
                settledQty: settledMap.get(p._id) || 0,
                outstandingQty: p.orderedQty - (settledMap.get(p._id) || 0),
            })).filter((p) => p.outstandingQty > 0);

            setOrderedProducts([...productMap.values()]);
            setOutstandingProducts(outstanding);
            // Auto-populate form items with all outstanding products (qty blank)
            setForm(f => ({
                ...f,
                items: outstanding.map(p => ({ product: p._id, price: p.price, quantity: '' })),
            }));
        }).catch(() => {});
    }, [customerId, outstandingRefresh]);

    // Update qty for a specific row (identified by product id)
    const updateQty = (pid, val) => {
        setForm((f) => ({
            ...f,
            items: f.items.map((it) => it.product === pid ? { ...it, quantity: val } : it),
        }));
    };

    // Only rows with a qty entered count toward the total
    const activeItems = form.items.filter(it => Number(it.quantity) > 0);
    const computedAmount = activeItems.length > 0
        ? activeItems.reduce((acc, it) => acc + (Number(it.price) || 0) * (Number(it.quantity) || 0), 0)
        : null;

    const validateForm = () => {
        const e = {};
        const effectiveAmount = activeItems.length > 0 ? computedAmount : Number(form.amount);
        if (!effectiveAmount || isNaN(effectiveAmount) || effectiveAmount <= 0)
            e.amount = 'Enter a payment amount or settle at least one product';
        if (!form.paymentDate) e.paymentDate = 'Payment date is required';
        return e;
    };

    const submitPayment = async (payload) => {
        setSubmitting(true);
        try {
            const res = await api.post('/sor/payments', payload);
            if (res.data.requiresConfirmation) {
                setConfirmDialog({ open: true, warning: res.data.warning, pendingPayload: { ...payload, confirmed: true } });
                return;
            }
            toast.success('Payment recorded');
            setForm(emptyPayment);
            fetchPayments();
            setOutstandingRefresh(r => r + 1);
            if (onPaymentRecorded) onPaymentRecorded();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to record payment');
        } finally { setSubmitting(false); }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const errs = validateForm();
        if (Object.keys(errs).length) { setFormErr(errs); return; }
        const effectiveAmount = activeItems.length > 0 ? computedAmount : Number(form.amount);
        submitPayment({
            customer: customerId,
            amount: effectiveAmount,
            paymentDate: form.paymentDate,
            ...(form.referenceNote.trim() && { referenceNote: form.referenceNote.trim() }),
            items: activeItems.map((it) => ({
                product: it.product,
                quantity: Number(it.quantity),
                price: Number(it.price),
            })),
            ...(activeCountry?._id && { countryId: activeCountry._id }),
        });
    };

    const handleConfirmOverpayment = async () => {
        setConfirmDialog((d) => ({ ...d, open: false }));
        await submitPayment(confirmDialog.pendingPayload);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this payment? The liability will be recalculated.')) return;
        try {
            await api.delete(`/sor/payments/${id}`);
            toast.success('Payment deleted');
            fetchPayments();
            if (onPaymentRecorded) onPaymentRecorded();
        } catch { toast.error('Delete failed'); }
    };

    return (
        <div>
            {/* Outstanding products summary */}
            {/* {outstandingProducts.length > 0 && (
                <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: '10px', padding: '1rem 1.25rem', marginBottom: '1.25rem' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <FiAlertTriangle size={13} /> Outstanding Products ({outstandingProducts.length} product{outstandingProducts.length !== 1 ? 's' : ''}, {outstandingProducts.reduce((a, p) => a + p.outstandingQty, 0).toLocaleString()} units total)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.5rem' }}>
                        {outstandingProducts.map((p) => (
                            <div key={p._id} style={{ background: '#fff', border: '1px solid #FED7AA', borderRadius: '7px', padding: '0.6rem 0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                                <div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1E293B' }}>{p.name}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '1px' }}>
                                        Ordered: {p.orderedQty.toLocaleString()} · Settled: {p.settledQty.toLocaleString()}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                    <div style={{ fontSize: '1rem', fontWeight: 800, color: '#EA580C' }}>{p.outstandingQty.toLocaleString()}</div>
                                    <div style={{ fontSize: '0.7rem', color: '#94A3B8' }}>units left</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )} */}

            {/* Record payment form */}
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '1.25rem', marginBottom: '1.5rem' }}>
                <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: 600, color: '#1E293B' }}>Record Payment</h3>
                <form onSubmit={handleSubmit} noValidate>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label>
                                Amount ({symbol}) <span style={{ color: '#DC2626' }}>*</span>
                                {form.items.length > 0 && computedAmount !== null && (
                                    <span style={{ marginLeft: '0.5rem', fontSize: '0.78rem', color: '#10B981', fontWeight: 600 }}>
                                        (auto: {fmt(computedAmount)})
                                    </span>
                                )}
                            </label>
                            <input
                                type="number" min="0.01" step="0.01"
                                value={computedAmount !== null ? computedAmount.toFixed(2) : form.amount}
                                readOnly={computedAmount !== null}
                                onChange={(e) => { setForm((f) => ({ ...f, amount: e.target.value })); setFormErr((fe) => ({ ...fe, amount: undefined })); }}
                                placeholder="0.00"
                                style={{ ...(formErr.amount ? { borderColor: '#DC2626' } : {}), ...(computedAmount !== null ? { background: '#F1F5F9', color: '#64748B' } : {}) }}
                            />
                            {formErr.amount && <small style={{ color: '#DC2626' }}>{formErr.amount}</small>}
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label>Payment Date <span style={{ color: '#DC2626' }}>*</span></label>
                            <input type="date" value={form.paymentDate}
                                onChange={(e) => { setForm((f) => ({ ...f, paymentDate: e.target.value })); setFormErr((fe) => ({ ...fe, paymentDate: undefined })); }}
                                style={formErr.paymentDate ? { borderColor: '#DC2626' } : {}} />
                            {formErr.paymentDate && <small style={{ color: '#DC2626' }}>{formErr.paymentDate}</small>}
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label>Reference Note <span style={{ color: '#94A3B8', fontSize: '0.78rem' }}>(optional)</span></label>
                            <input type="text" value={form.referenceNote}
                                onChange={(e) => setForm((f) => ({ ...f, referenceNote: e.target.value }))}
                                placeholder="e.g. Bank transfer ref" />
                        </div>
                    </div>

                    {/* Product settlement table */}
                    <div style={{ marginTop: '1.25rem' }}>
                        <div style={{ marginBottom: '0.6rem' }}>
                            <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#1E293B' }}>
                                Products Settled <span style={{ color: '#94A3B8', fontSize: '0.78rem', fontWeight: 400 }}>(enter qty to settle)</span>
                            </span>
                        </div>

                        {form.items.length > 0 ? (
                            <div className="table-container" style={{ marginBottom: '0.5rem' }}>
                                <table className="data-table" style={{ fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr>
                                            <th>Product</th>
                                            <th style={{ textAlign: 'right' }}>Unit Price</th>
                                            <th style={{ textAlign: 'right' }}>Outstanding</th>
                                            <th style={{ textAlign: 'right', width: '110px' }}>Settle Qty</th>
                                            <th style={{ textAlign: 'right' }}>Line Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {form.items.map((item) => {
                                            const outstanding = outstandingProducts.find(p => p._id === item.product);
                                            const lineTotal = (Number(item.price) || 0) * (Number(item.quantity) || 0);
                                            const isActive = Number(item.quantity) > 0;
                                            return (
                                                <tr key={item.product} style={{ background: isActive ? '#F0FDF4' : undefined }}>
                                                    <td style={{ fontWeight: isActive ? 600 : 400 }}>
                                                        {outstanding?.name || item.product}
                                                    </td>
                                                    <td style={{ textAlign: 'right', color: '#475569', whiteSpace: 'nowrap' }}>
                                                        {item.price ? fmt(item.price) : '—'}
                                                    </td>
                                                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                        <span style={{ fontWeight: 600, color: '#EA580C' }}>
                                                            {outstanding?.outstandingQty.toLocaleString() ?? '—'} units
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <input
                                                            type="number" min={0}
                                                            value={item.quantity}
                                                            onChange={(e) => updateQty(item.product, e.target.value)}
                                                            placeholder="0"
                                                            style={{ width: '100%', textAlign: 'right', background: isActive ? '#fff' : '#F8FAFC' }}
                                                        />
                                                    </td>
                                                    <td style={{ textAlign: 'right', fontWeight: 600, color: lineTotal > 0 ? '#10B981' : '#94A3B8', whiteSpace: 'nowrap' }}>
                                                        {lineTotal > 0 ? fmt(lineTotal) : '—'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    {activeItems.length > 0 && (
                                        <tfoot>
                                            <tr style={{ borderTop: '2px solid #E2E8F0' }}>
                                                <td colSpan={3} style={{ textAlign: 'right', fontWeight: 600, fontSize: '0.88rem', color: '#1E293B' }}>
                                                    Total ({activeItems.length} product{activeItems.length !== 1 ? 's' : ''}):
                                                </td>
                                                <td style={{ textAlign: 'right', fontWeight: 700, color: '#10B981', whiteSpace: 'nowrap' }}>{fmt(computedAmount)}</td>
                                                <td></td>
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '1.5rem', color: '#94A3B8', fontSize: '0.85rem', border: '1px dashed #E2E8F0', borderRadius: '8px' }}>
                                No outstanding products to settle.
                            </div>
                        )}
                        {formErr.items && <small style={{ color: '#DC2626', display: 'block', marginBottom: '0.25rem' }}>{formErr.items}</small>}
                    </div>

                    <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                        <button type="submit" className="btn btn-primary" disabled={submitting}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <FiCheck size={14} /> {submitting ? 'Recording...' : 'Record Payment'}
                        </button>
                    </div>
                </form>
            </div>

            {/* Payments list */}
            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', fontWeight: 600, color: '#1E293B' }}>Payment History</h3>
            {loading ? <Spinner /> : payments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2.5rem', color: '#94A3B8' }}>No payments recorded yet.</div>
            ) : (
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th style={{ textAlign: 'right' }}>Amount</th>
                                <th>Products Settled</th>
                                <th>Reference Note</th>
                                <th>Recorded By</th>
                                {isAdmin && <th>Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {payments.map((p) => (
                                <>
                                    <tr key={p._id}>
                                        <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(p.paymentDate)}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#10B981' }}>{fmt(p.amount)}</td>
                                        <td>
                                            {p.items && p.items.length > 0 ? (
                                                <button
                                                    onClick={() => setExpandedPayment(expandedPayment === p._id ? null : p._id)}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4880FF', fontSize: '0.82rem', fontWeight: 600, padding: 0 }}>
                                                    {p.items.length} product{p.items.length !== 1 ? 's' : ''} {expandedPayment === p._id ? '▲' : '▼'}
                                                </button>
                                            ) : (
                                                <span style={{ color: '#94A3B8', fontSize: '0.82rem' }}>Cash only</span>
                                            )}
                                        </td>
                                        <td style={{ color: '#475569', fontSize: '0.88rem' }}>{p.referenceNote || '—'}</td>
                                        <td style={{ fontSize: '0.85rem', color: '#64748B' }}>{p.recordedBy?.email || p.recordedBy?.name || '—'}</td>
                                        {isAdmin && (
                                            <td>
                                                <button onClick={() => handleDelete(p._id)} className="btn-icon" title="Delete payment" style={{ color: '#DC2626' }}>
                                                    <FiTrash2 />
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                    {expandedPayment === p._id && p.items?.length > 0 && (
                                        <tr key={`${p._id}-items`}>
                                            <td colSpan={isAdmin ? 6 : 5} style={{ padding: '0 1rem 0.75rem 1rem', background: '#F8FAFC' }}>
                                                <table style={{ width: '100%', fontSize: '0.83rem', borderCollapse: 'collapse' }}>
                                                    <thead>
                                                        <tr style={{ color: '#64748B' }}>
                                                            <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600 }}>Product</th>
                                                            <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 600 }}>Qty</th>
                                                            <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 600 }}>Unit Price</th>
                                                            <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 600 }}>Subtotal</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {p.items.map((it, idx) => (
                                                            <tr key={idx} style={{ borderTop: '1px solid #E2E8F0' }}>
                                                                <td style={{ padding: '4px 8px' }}>{it.product?.name || it.product || '—'}</td>
                                                                <td style={{ textAlign: 'right', padding: '4px 8px' }}>{it.quantity}</td>
                                                                <td style={{ textAlign: 'right', padding: '4px 8px' }}>{fmt(it.price)}</td>
                                                                <td style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 600 }}>{fmt(it.price * it.quantity)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </td>
                                        </tr>
                                    )}
                                </>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Overpayment confirmation dialog */}
            {confirmDialog.open && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '440px' }}>
                        <div className="modal-header">
                            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#92400E' }}>
                                <FiAlertTriangle /> Overpayment Warning
                            </h2>
                        </div>
                        <div style={{ padding: '1rem 0', color: '#475569', lineHeight: 1.6 }}>
                            {confirmDialog.warning}
                        </div>
                        <p style={{ color: '#64748B', fontSize: '0.9rem' }}>
                            Do you want to record this payment anyway?
                        </p>
                        <div className="modal-actions">
                            <button onClick={() => setConfirmDialog({ open: false, warning: '', pendingPayload: null })}
                                className="btn btn-secondary">Cancel</button>
                            <button onClick={handleConfirmOverpayment} className="btn btn-primary"
                                style={{ background: '#F59E0B', borderColor: '#F59E0B' }}>
                                Confirm Overpayment
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── MAIN PAGE ───────────────────────────────────────────────────────────────
const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'ledger', label: 'Ledger' },
    { key: 'templates', label: 'Templates' },
    { key: 'payments', label: 'Payments' },
];

const SORCustomerDetail = () => {
    const { format: fmt } = useCurrency();
    const { id } = useParams();
    const navigate = useNavigate();
    const { activeCountry } = useCountry();

    const [customer, setCustomer] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');

    // Edit customer modal
    const [editOpen, setEditOpen] = useState(false);
    const [editForm, setEditForm] = useState({});
    const [editErr, setEditErr] = useState({});
    const [editSubmitting, setEditSubmitting] = useState(false);

    const fetchCustomer = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get(`/sor/customers/${id}`);
            setCustomer(res.data.data);
        } catch {
            toast.error('Failed to load customer');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { fetchCustomer(); }, [fetchCustomer]);

    const openEdit = () => {
        setEditForm({
            name: customer.name || '',
            phone: customer.phone || '',
            address: customer.address || '',
            email: customer.email || '',
            notes: customer.notes || '',
        });
        setEditErr({});
        setEditOpen(true);
    };

    const handleEditSubmit = async (e) => {
        e.preventDefault();
        const errs = {};
        if (!editForm.name?.trim()) errs.name = 'Name is required';
        if (!editForm.phone?.trim()) errs.phone = 'Phone is required';
        if (!editForm.address?.trim()) errs.address = 'Address is required';
        if (Object.keys(errs).length) { setEditErr(errs); return; }
        setEditSubmitting(true);
        try {
            await api.put(`/sor/customers/${id}`, {
                name: editForm.name.trim(),
                phone: editForm.phone.trim(),
                address: editForm.address.trim(),
                ...(editForm.email?.trim() && { email: editForm.email.trim() }),
                ...(editForm.notes?.trim() && { notes: editForm.notes.trim() }),
            });
            toast.success('Customer updated');
            setEditOpen(false);
            fetchCustomer();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Update failed');
        } finally { setEditSubmitting(false); }
    };

    if (loading) return <Spinner fullPage />;
    if (!customer) return (
        <div className="page-container">
            <div className="alert alert-error">Customer not found.</div>
        </div>
    );

    const liability = customer.outstandingLiability ?? 0;
    const isSettled = liability <= 0;

    return (
        <div className="page-container">
            {/* Header */}
            <div className="page-header" style={{ marginBottom: '1.5rem' }}>
                <div>
                    <button onClick={() => navigate('/sor/customers')} className="btn btn-secondary"
                        style={{ marginBottom: '0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '6px 12px', fontSize: '0.85rem' }}>
                        <FiArrowLeft /> Back to Customers
                    </button>
                    <h1 style={{ margin: '0.25rem 0 0', fontSize: '1.6rem', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {customer.name}
                        {isSettled && (
                            <span style={{ padding: '3px 12px', borderRadius: '99px', fontSize: '0.75rem', fontWeight: 700, background: '#D1FAE5', color: '#065F46' }}>
                                Settled
                            </span>
                        )}
                    </h1>
                    <p style={{ color: '#64748B', fontSize: '0.88rem', margin: '0.25rem 0 0' }}>
                        {customer.phone} · {customer.address}
                        {customer.email && ` · ${customer.email}`}
                    </p>
                </div>
                <button onClick={openEdit} className="btn btn-secondary"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <FiEdit2 size={14} /> Edit Customer
                </button>
            </div>

            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                <SummaryCard
                    label="Total Ordered"
                    value={fmt(customer.totalOrdered)}
                    color="#1D4ED8"
                    icon={<FiShoppingCart size={13} />}
                />
                <SummaryCard
                    label="Total Paid"
                    value={fmt(customer.totalPaid)}
                    color="#10B981"
                    icon={<FiDollarSign size={13} />}
                />
                <SummaryCard
                    label="Outstanding Liability"
                    value={isSettled ? fmt(0) : fmt(liability)}
                    color={isSettled ? '#10B981' : '#DC2626'}
                    icon={<FiCreditCard size={13} />}
                    badge={isSettled ? (
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#065F46', background: '#D1FAE5', padding: '2px 10px', borderRadius: '99px', alignSelf: 'flex-start' }}>
                            Settled
                        </span>
                    ) : null}
                />
            </div>

            {/* Notes */}
            {customer.notes && (
                <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1.5rem', fontSize: '0.88rem', color: '#78350F' }}>
                    <strong>Notes:</strong> {customer.notes}
                </div>
            )}

            {/* Tabs */}
            <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />

            {activeTab === 'overview' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem' }}>
                    <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '1.25rem' }}>
                        <h3 style={{ margin: '0 0 1rem', fontSize: '0.95rem', fontWeight: 600, color: '#1E293B', borderBottom: '1px solid #F1F5F9', paddingBottom: '0.75rem' }}>
                            Contact Details
                        </h3>
                        {[
                            { label: 'Name', value: customer.name },
                            { label: 'Phone', value: customer.phone },
                            { label: 'Address', value: customer.address },
                            { label: 'Email', value: customer.email || '—' },
                        ].map(({ label, value }) => (
                            <div key={label} style={{ marginBottom: '0.75rem' }}>
                                <div style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
                                <div style={{ fontSize: '0.9rem', color: '#1E293B', marginTop: '0.15rem' }}>{value}</div>
                            </div>
                        ))}
                    </div>
                    <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '1.25rem' }}>
                        <h3 style={{ margin: '0 0 1rem', fontSize: '0.95rem', fontWeight: 600, color: '#1E293B', borderBottom: '1px solid #F1F5F9', paddingBottom: '0.75rem' }}>
                            Account Summary
                        </h3>
                        {[
                            { label: 'Total Ordered', value: fmt(customer.totalOrdered), color: '#1D4ED8' },
                            { label: 'Total Paid', value: fmt(customer.totalPaid), color: '#10B981' },
                            { label: 'Outstanding Liability', value: isSettled ? 'Settled' : fmt(liability), color: isSettled ? '#10B981' : '#DC2626' },
                        ].map(({ label, value, color }) => (
                            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                <span style={{ fontSize: '0.88rem', color: '#64748B' }}>{label}</span>
                                <span style={{ fontWeight: 700, color }}>{value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {activeTab === 'ledger' && <LedgerPanel customerId={id} />}
            {activeTab === 'templates' && <TemplatesPanel customerId={id} countryId={activeCountry?._id} />}
            {activeTab === 'payments' && <PaymentsPanel customerId={id} onPaymentRecorded={fetchCustomer} />}

            {/* Edit Customer Modal */}
            {editOpen && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '520px' }}>
                        <div className="modal-header">
                            <h2>Edit Customer</h2>
                            <button onClick={() => setEditOpen(false)} className="btn-close"><FiX /></button>
                        </div>
                        <form onSubmit={handleEditSubmit} noValidate>
                            {[
                                { field: 'name', label: 'Full Name', type: 'text', required: true, placeholder: 'e.g. Amina Bello' },
                                { field: 'phone', label: 'Phone', type: 'tel', required: true, placeholder: 'e.g. 08012345678' },
                                { field: 'email', label: 'Email', type: 'email', required: false, placeholder: 'e.g. amina@example.com' },
                            ].map(({ field, label, type, required, placeholder }) => (
                                <div className="form-group" key={field}>
                                    <label>{label} {required ? <span style={{ color: '#DC2626' }}>*</span> : <span style={{ color: '#94A3B8', fontSize: '0.78rem' }}>(optional)</span>}</label>
                                    <input type={type} value={editForm[field] || ''} placeholder={placeholder}
                                        onChange={(e) => { setEditForm((f) => ({ ...f, [field]: e.target.value })); setEditErr((fe) => ({ ...fe, [field]: undefined })); }}
                                        style={editErr[field] ? { borderColor: '#DC2626' } : {}} />
                                    {editErr[field] && <small style={{ color: '#DC2626' }}>{editErr[field]}</small>}
                                </div>
                            ))}
                            <div className="form-group">
                                <label>Address <span style={{ color: '#DC2626' }}>*</span></label>
                                <textarea value={editForm.address || ''} rows={2} style={{ resize: 'vertical', ...(editErr.address ? { borderColor: '#DC2626' } : {}) }}
                                    onChange={(e) => { setEditForm((f) => ({ ...f, address: e.target.value })); setEditErr((fe) => ({ ...fe, address: undefined })); }}
                                    placeholder="e.g. 12 Market Road, Kano" />
                                {editErr.address && <small style={{ color: '#DC2626' }}>{editErr.address}</small>}
                            </div>
                            <div className="form-group">
                                <label>Notes <span style={{ color: '#94A3B8', fontSize: '0.78rem' }}>(optional)</span></label>
                                <textarea value={editForm.notes || ''} rows={2} style={{ resize: 'vertical' }}
                                    onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                                    placeholder="Any additional notes..." />
                            </div>
                            <div className="modal-actions">
                                <button type="button" onClick={() => setEditOpen(false)} className="btn btn-secondary" disabled={editSubmitting}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={editSubmitting}>
                                    {editSubmitting ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SORCustomerDetail;
