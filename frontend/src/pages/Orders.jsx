import { useState, useEffect, useCallback, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiPlus, FiChevronUp, FiChevronDown, FiEye } from 'react-icons/fi';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import api from '../utils/api';
import Spinner from '../components/Spinner';
import PermissionGuard from '../components/PermissionGuard';
import { PERMISSIONS } from '../utils/constants';
import ExportButton from '../components/ExportButton';
import { useCountry } from '../context/CountryContext';
import useCurrency from '../hooks/useCurrency';

const Orders = () => {
    const navigate = useNavigate();
    const { activeCountry } = useCountry();
    const { format, formatShort, symbol } = useCurrency();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState('');
    const [filterWarehouse, setFilterWarehouse] = useState('');
    const [filterSOR, setFilterSOR] = useState('');
    const [filterPaymentStatus, setFilterPaymentStatus] = useState('');
    const [warehouses, setWarehouses] = useState([]);
    const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });
    const [expandedOrders, setExpandedOrders] = useState([]);
    const [sorOrderIds, setSorOrderIds] = useState(new Set());
    const [paymentStatusUpdating, setPaymentStatusUpdating] = useState(new Set());

    // Compute MTD and YTD chart data from orders
    const getMTDData = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const daily = {};
        for (let d = 1; d <= daysInMonth; d++) daily[d] = 0;
        orders.forEach(o => {
            const d = new Date(o.createdAt);
            if (d.getFullYear() === year && d.getMonth() === month) {
                daily[d.getDate()] = (daily[d.getDate()] || 0) + (o.totalAmount || 0);
            }
        });
        return Object.entries(daily).map(([day, revenue]) => ({ day: `${day}`, revenue }));
    };

    const getYTDData = () => {
        const now = new Date();
        const year = now.getFullYear();
        const monthly = {};
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        months.forEach((m, i) => { monthly[i] = { month: m, revenue: 0 }; });
        orders.forEach(o => {
            const d = new Date(o.createdAt);
            if (d.getFullYear() === year) {
                monthly[d.getMonth()].revenue += (o.totalAmount || 0);
            }
        });
        return Object.values(monthly).slice(0, now.getMonth() + 1);
    };

    const totalAmount = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

    useEffect(() => {
        if (activeCountry?._id) fetchWarehouses();
        api.get(`/sor/orders${activeCountry?._id ? `?countryId=${activeCountry._id}` : ''}`).then((res) => {
            const ids = new Set((res.data.data || []).map((so) => String(so.order?._id || so.order)));
            setSorOrderIds(ids);
        }).catch(() => {});
    }, []);

    const fetchWarehouses = async () => {
        try {
            const countryParam = activeCountry?._id ? `?countryId=${activeCountry._id}` : '';
            const res = await api.get(`/warehouses${countryParam}`);
            setWarehouses(res.data.data);
        } catch (err) {
            console.error('Failed to load warehouses', err);
        }
    };

    const fetchOrders = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filterStatus) params.append('status', filterStatus);
            if (filterWarehouse) params.append('warehouseId', filterWarehouse);
            if (filterSOR) params.append('isSOR', filterSOR);
            if (filterPaymentStatus) params.append('paymentStatus', filterPaymentStatus);
            if (dateRange.startDate) params.append('startDate', dateRange.startDate);
            if (dateRange.endDate) params.append('endDate', dateRange.endDate);
            if (activeCountry?._id) params.append('countryId', activeCountry._id);
            const res = await api.get(`/orders?${params.toString()}`);
            setOrders(res.data.data);
        } catch (err) {
            console.error('Failed to load orders', err);
        } finally {
            setLoading(false);
        }
    }, [filterStatus, filterWarehouse, filterSOR, filterPaymentStatus, dateRange, activeCountry?._id]);

    useEffect(() => { if (activeCountry?._id) fetchOrders(); }, [fetchOrders]);

    const handleDateFilter = () => { fetchOrders(); };

    const handleClearFilters = () => {
        setDateRange({ startDate: '', endDate: '' });
        setFilterStatus('');
        setFilterWarehouse('');
        setFilterSOR('');
        setFilterPaymentStatus('');
    };

    const toggleOrderExpansion = (orderId, e) => {
        e.stopPropagation();
        setExpandedOrders(prev =>
            prev.includes(orderId)
                ? prev.filter(id => id !== orderId)
                : [...prev, orderId]
        );
    };

    const togglePaymentStatus = async (order, e) => {
        e.stopPropagation();
        const newStatus = order.paymentStatus === 'NOT_PAID' ? 'PAID' : 'NOT_PAID';
        setPaymentStatusUpdating(prev => new Set([...prev, order._id]));
        try {
            await api.patch(`/orders/${order._id}/payment-status`, { paymentStatus: newStatus });
            setOrders(prev => prev.map(o => o._id === order._id ? { ...o, paymentStatus: newStatus } : o));
        } catch (err) {
            console.error('Failed to update payment status', err);
        } finally {
            setPaymentStatusUpdating(prev => { const s = new Set(prev); s.delete(order._id); return s; });
        }
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'PENDING': return 'warning';
            case 'CONFIRMED': return 'active';
            case 'CANCELLED': return 'discontinued';
            default: return '';
        }
    };

    // Prepare export data
    const getExportData = () => {
        return orders.map(order => ({
            orderId: `#${order.orderNumber || order._id.slice(-6).toUpperCase()}`,
            customerName: order.customer?.name || '',
            customerPhone: order.customer?.phone || '',
            customerEmail: order.customer?.email || '',
            status: order.status || '',
            paymentStatus: order.paymentStatus === 'NOT_PAID' ? 'Not Paid' : 'Paid',
            channel: order.channel || '',
            warehouse: order.warehouse?.name || '',
            region: order.region || '',
            totalAmount: parseFloat((order.totalAmount || 0).toFixed(2)),
            itemCount: order.items?.length || 0,
            date: new Date(order.createdAt).toLocaleDateString()
        }));
    };

    const exportColumns = [
        { key: 'orderId', label: 'Order ID' },
        { key: 'customerName', label: 'Customer Name' },
        { key: 'customerPhone', label: 'Phone' },
        { key: 'customerEmail', label: 'Email' },
        { key: 'status', label: 'Status' },
        { key: 'paymentStatus', label: 'Payment Status' },
        { key: 'channel', label: 'Channel' },
        { key: 'warehouse', label: 'Warehouse' },
        { key: 'region', label: 'Region' },
        { key: 'totalAmount', label: `Total Amount (${symbol})` },
        { key: 'itemCount', label: 'Items Count' },
        { key: 'date', label: 'Date' }
    ];

    return (
        <div className="page-container">
            <div className="page-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <h1>Orders</h1>
                    {activeCountry && (
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, background: '#F0F4FF', color: '#4880FF', padding: '4px 12px', borderRadius: '20px', border: '1px solid #D1DEFF' }}>
                            🌍 {activeCountry.name}
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {orders.length > 0 && (
                        <ExportButton
                            data={getExportData()}
                            columns={exportColumns}
                            filename={`orders-${new Date().toISOString().split('T')[0]}`}
                            label="Export"
                        />
                    )}
                    <PermissionGuard permission={PERMISSIONS.CREATE_ORDERS}>
                        <button onClick={() => navigate('/orders/new')} className="btn btn-primary">
                            <FiPlus /> New Order
                        </button>
                    </PermissionGuard>
                </div>
            </div>

            <div className="filters-bar" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="filter-select"
                >
                    <option value="">All Statuses</option>
                    <option value="PENDING">Pending</option>
                    <option value="CONFIRMED">Confirmed</option>
                    <option value="CANCELLED">Cancelled</option>
                </select>

                <select
                    value={filterSOR}
                    onChange={(e) => setFilterSOR(e.target.value)}
                    className="filter-select"
                >
                    <option value="">All Order Types</option>
                    <option value="true">SOR Orders</option>
                    <option value="false">Regular Orders</option>
                </select>

                <select
                    value={filterPaymentStatus}
                    onChange={(e) => setFilterPaymentStatus(e.target.value)}
                    className="filter-select"
                >
                    <option value="">All Payment Statuses</option>
                    <option value="PAID">Paid</option>
                    <option value="NOT_PAID">Not Paid</option>
                </select>

                <select
                    value={filterWarehouse}
                    onChange={(e) => setFilterWarehouse(e.target.value)}
                    className="filter-select"
                >
                    <option value="">All Warehouses</option>
                    {warehouses.map(wh => (
                        <option key={wh._id} value={wh._id}>{wh.name}</option>
                    ))}
                </select>

                <input
                    type="date"
                    value={dateRange.startDate}
                    onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                    style={{ padding: '8px', borderRadius: '6px', border: '1px solid #E2E8F0' }}
                    placeholder="Start Date"
                />
                <span>to</span>
                <input
                    type="date"
                    value={dateRange.endDate}
                    onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                    style={{ padding: '8px', borderRadius: '6px', border: '1px solid #E2E8F0' }}
                    placeholder="End Date"
                />
                <button onClick={handleDateFilter} className="btn btn-primary" style={{ padding: '5px 10px', fontSize: '0.8rem' }}>
                    Apply
                </button>
                {(dateRange.startDate || dateRange.endDate || filterStatus || filterWarehouse || filterSOR || filterPaymentStatus) && (
                    <button 
                        onClick={handleClearFilters} 
                        className="btn btn-secondary"
                        style={{ padding: '5px 10px', fontSize: '0.8rem' }}
                    >
                        Clear All
                    </button>
                )}
            </div>

            {loading ? (
                <Spinner fullPage />
            ) : (
                <>
                {/* MTD / YTD Charts */}
                {orders.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', margin: '1.25rem 0' }}>
                        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '1rem 1.25rem' }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1E293B', marginBottom: '0.75rem' }}>
                                Month-to-Date Sales ({new Date().toLocaleString('default', { month: 'long', year: 'numeric' })})
                            </div>
                            <ResponsiveContainer width="100%" height={180}>
                                <BarChart data={getMTDData()} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#94A3B8' }} interval={4} />
                                    <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} tickFormatter={v => `${symbol}${(v/1000).toFixed(0)}k`} width={48} />
                                    <Tooltip formatter={v => [formatShort(v), 'Revenue']} labelFormatter={l => `Day ${l}`} />
                                    <Bar dataKey="revenue" radius={[3,3,0,0]} minPointSize={3}>
                                        {getMTDData().map((entry, i) => (
                                            <Cell key={i} fill={entry.revenue > 0 ? '#4880FF' : '#DBEAFE'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '1rem 1.25rem' }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1E293B', marginBottom: '0.75rem' }}>
                                Year-to-Date Sales ({new Date().getFullYear()})
                            </div>
                            <ResponsiveContainer width="100%" height={180}>
                                <BarChart data={getYTDData()} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94A3B8' }} />
                                    <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} tickFormatter={v => `${symbol}${(v/1000).toFixed(0)}k`} width={48} />
                                    <Tooltip formatter={v => [formatShort(v), 'Revenue']} />
                                    <Bar dataKey="revenue" radius={[3,3,0,0]} minPointSize={3}>
                                        {getYTDData().map((entry, i) => (
                                            <Cell key={i} fill={entry.revenue > 0 ? '#10B981' : '#D1FAE5'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Order ID</th>
                                <th>Customer</th>
                                <th>Warehouse</th>
                                <th>Date</th>
                                <th>Status</th>
                                <th>Channel</th>
                                <th>Total</th>
                                <th>Payment</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {orders.length > 0 ? (
                                orders.map((order) => (
                                    <Fragment key={order._id}>
                                        <tr className="hover-row" onClick={() => navigate(`/orders/${order._id}`)}>
                                            <td className="font-mono text-sm">#{order.orderNumber || order._id.slice(-6).toUpperCase()}</td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                    {order.customer?.name}
                                                    {sorOrderIds.has(String(order._id)) && (
                                                        <span style={{
                                                            fontSize: '0.68rem', fontWeight: 700, padding: '1px 7px',
                                                            borderRadius: '99px', background: '#EDE9FE', color: '#6D28D9',
                                                            whiteSpace: 'nowrap',
                                                        }}>SOR</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td>{order.warehouse?.name || 'N/A'}</td>
                                            <td>{new Date(order.createdAt).toLocaleDateString()}</td>
                                            <td>
                                                <span className={`status-badge ${getStatusBadge(order.status)}`}>
                                                    {order.status}
                                                </span>
                                            </td>
                                            <td>{order.channel || 'N/A'}</td>
                                            <td>{formatShort(order.totalAmount || 0)}</td>
                                            <td onClick={e => e.stopPropagation()}>
                                                <button
                                                    onClick={(e) => togglePaymentStatus(order, e)}
                                                    disabled={paymentStatusUpdating.has(order._id)}
                                                    style={{
                                                        padding: '3px 10px',
                                                        borderRadius: '99px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 600,
                                                        border: 'none',
                                                        cursor: paymentStatusUpdating.has(order._id) ? 'not-allowed' : 'pointer',
                                                        background: order.paymentStatus === 'NOT_PAID' ? '#FEE2E2' : '#D1FAE5',
                                                        color: order.paymentStatus === 'NOT_PAID' ? '#DC2626' : '#059669',
                                                        opacity: paymentStatusUpdating.has(order._id) ? 0.6 : 1,
                                                        whiteSpace: 'nowrap',
                                                    }}
                                                    title="Click to toggle payment status"
                                                >
                                                    {order.paymentStatus === 'NOT_PAID' ? 'Not Paid' : 'Paid'}
                                                </button>
                                            </td>
                                            <td>
                                                <div className="button-group">
                                                    <button
                                                        className="btn btn-sm btn-secondary"
                                                        onClick={(e) => { e.stopPropagation(); navigate(`/orders/${order._id}`); }}
                                                        title="View"
                                                    >
                                                        <FiEye />
                                                    </button>
                                                    <button
                                                        className={`btn btn-sm btn-secondary toggle-btn ${expandedOrders.includes(order._id) ? 'active' : ''}`}
                                                        onClick={(e) => toggleOrderExpansion(order._id, e)}
                                                        title={expandedOrders.includes(order._id) ? 'Collapse' : 'See More'}
                                                    >
                                                        {expandedOrders.includes(order._id) ? <FiChevronUp /> : <FiChevronDown />}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                        {expandedOrders.includes(order._id) && (
                                            <tr className="expanded-row">
                                                <td colSpan="9" style={{ padding: 0, background: '#F8FAFC', borderTop: '2px solid #E2E8F0' }}>
                                                    <div style={{ padding: '20px 24px' }}>
                                                        {/* Order Details Grid */}
                                                        <div style={{ 
                                                            display: 'grid', 
                                                            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                                                            gap: '16px',
                                                            marginBottom: '20px',
                                                            padding: '16px',
                                                            background: '#fff',
                                                            borderRadius: '8px',
                                                            border: '1px solid #E2E8F0'
                                                        }}>
                                                            <div>
                                                                <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '4px', fontWeight: 500 }}>
                                                                    Warehouse
                                                                </div>
                                                                <div style={{ fontSize: '0.9rem', color: '#1E293B', fontWeight: 600 }}>
                                                                    {order.warehouse?.name || 'N/A'}
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '4px', fontWeight: 500 }}>
                                                                    Region
                                                                </div>
                                                                <div style={{ fontSize: '0.9rem', color: '#1E293B', fontWeight: 600 }}>
                                                                    {order.region?.name || 'N/A'}
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '4px', fontWeight: 500 }}>
                                                                    Customer Phone
                                                                </div>
                                                                <div style={{ fontSize: '0.9rem', color: '#1E293B', fontWeight: 600 }}>
                                                                    {order.customer?.phone || 'N/A'}
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '4px', fontWeight: 500 }}>
                                                                    Customer Email
                                                                </div>
                                                                <div style={{ fontSize: '0.9rem', color: '#1E293B', fontWeight: 600 }}>
                                                                    {order.customer?.email || 'N/A'}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Order Items */}
                                                        <div style={{ 
                                                            background: '#fff',
                                                            borderRadius: '8px',
                                                            border: '1px solid #E2E8F0',
                                                            overflow: 'hidden'
                                                        }}>
                                                            <div style={{ 
                                                                padding: '12px 16px',
                                                                background: '#F8FAFC',
                                                                borderBottom: '1px solid #E2E8F0',
                                                                fontSize: '0.85rem',
                                                                fontWeight: 600,
                                                                color: '#1E293B'
                                                            }}>
                                                                Order Items ({order.items?.length || 0})
                                                            </div>
                                                            <div style={{ padding: '12px' }}>
                                                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                                    <thead>
                                                                        <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                                                                            <th style={{ 
                                                                                padding: '8px 12px', 
                                                                                textAlign: 'left', 
                                                                                fontSize: '0.75rem', 
                                                                                fontWeight: 600, 
                                                                                color: '#64748B',
                                                                                textTransform: 'uppercase',
                                                                                letterSpacing: '0.5px'
                                                                            }}>Product</th>
                                                                            <th style={{ 
                                                                                padding: '8px 12px', 
                                                                                textAlign: 'left', 
                                                                                fontSize: '0.75rem', 
                                                                                fontWeight: 600, 
                                                                                color: '#64748B',
                                                                                textTransform: 'uppercase',
                                                                                letterSpacing: '0.5px'
                                                                            }}>SKU</th>
                                                                            <th style={{ 
                                                                                padding: '8px 12px', 
                                                                                textAlign: 'right', 
                                                                                fontSize: '0.75rem', 
                                                                                fontWeight: 600, 
                                                                                color: '#64748B',
                                                                                textTransform: 'uppercase',
                                                                                letterSpacing: '0.5px'
                                                                            }}>Quantity</th>
                                                                            <th style={{ 
                                                                                padding: '8px 12px', 
                                                                                textAlign: 'right', 
                                                                                fontSize: '0.75rem', 
                                                                                fontWeight: 600, 
                                                                                color: '#64748B',
                                                                                textTransform: 'uppercase',
                                                                                letterSpacing: '0.5px'
                                                                            }}>Unit Price</th>
                                                                            <th style={{ 
                                                                                padding: '8px 12px', 
                                                                                textAlign: 'right', 
                                                                                fontSize: '0.75rem', 
                                                                                fontWeight: 600, 
                                                                                color: '#64748B',
                                                                                textTransform: 'uppercase',
                                                                                letterSpacing: '0.5px'
                                                                            }}>Subtotal</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {order.items?.map((item, idx) => (
                                                                            <tr key={idx} style={{ 
                                                                                borderBottom: idx < order.items.length - 1 ? '1px solid #F1F5F9' : 'none'
                                                                            }}>
                                                                                <td style={{ padding: '12px', fontSize: '0.85rem', color: '#1E293B', fontWeight: 500 }}>
                                                                                    {item.product?.name || 'Unknown Product'}
                                                                                </td>
                                                                                <td style={{ padding: '12px' }}>
                                                                                    <code style={{ 
                                                                                        fontSize: '0.75rem', 
                                                                                        color: '#64748B',
                                                                                        background: '#F1F5F9',
                                                                                        padding: '2px 6px',
                                                                                        borderRadius: '4px'
                                                                                    }}>
                                                                                        {item.product?.sku || 'N/A'}
                                                                                    </code>
                                                                                </td>
                                                                                <td style={{ 
                                                                                    padding: '12px', 
                                                                                    textAlign: 'right', 
                                                                                    fontSize: '0.85rem',
                                                                                    color: '#1E293B',
                                                                                    fontWeight: 600
                                                                                }}>
                                                                                    {item.quantity?.toLocaleString() || 0}
                                                                                </td>
                                                                                <td style={{ 
                                                                                    padding: '12px', 
                                                                                    textAlign: 'right', 
                                                                                    fontSize: '0.85rem',
                                                                                    color: '#64748B'
                                                                                }}>
                                                                                    {format(item.price || 0)}
                                                                                </td>
                                                                                <td style={{ 
                                                                                    padding: '12px', 
                                                                                    textAlign: 'right', 
                                                                                    fontSize: '0.85rem',
                                                                                    color: '#10B981',
                                                                                    fontWeight: 600
                                                                                }}>
                                                                                    {format((item.quantity || 0) * (item.price || 0))}
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                    <tfoot>
                                                                        <tr style={{ borderTop: '2px solid #E2E8F0' }}>
                                                                            <td colSpan="4" style={{ 
                                                                                padding: '12px', 
                                                                                textAlign: 'right',
                                                                                fontSize: '0.9rem',
                                                                                fontWeight: 600,
                                                                                color: '#1E293B'
                                                                            }}>
                                                                                Total Amount:
                                                                            </td>
                                                                            <td style={{ 
                                                                                padding: '12px', 
                                                                                textAlign: 'right',
                                                                                fontSize: '1rem',
                                                                                fontWeight: 700,
                                                                                color: '#4880FF'
                                                                            }}>
                                                                                {format(order.totalAmount || 0)}
                                                                            </td>
                                                                        </tr>
                                                                    </tfoot>
                                                                </table>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="9" className="text-center">No orders found.</td>
                                </tr>
                            )}
                        </tbody>
                        {orders.length > 0 && (
                            <tfoot>
                                <tr style={{ background: '#F8FAFC', borderTop: '2px solid #E2E8F0' }}>
                                    <td colSpan={7} style={{ padding: '10px 12px', fontWeight: 700, fontSize: '0.9rem', color: '#1E293B' }}>
                                        Total ({orders.length} order{orders.length !== 1 ? 's' : ''})
                                    </td>
                                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, fontSize: '0.95rem', color: '#4880FF' }}>
                                        {format(totalAmount)}
                                    </td>
                                    <td></td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
                </>
            )}
        </div>
    );
};

export default Orders;
