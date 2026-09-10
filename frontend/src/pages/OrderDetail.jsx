import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FiArrowLeft, FiCheck, FiX, FiCopy, FiShare2, FiDownload, FiEdit2 } from 'react-icons/fi';
import api from '../utils/api';
import Spinner from '../components/Spinner';
import PermissionGuard from '../components/PermissionGuard';
import { PERMISSIONS } from '../utils/constants';
import { useCountry } from '../context/CountryContext';
import useCurrency from '../hooks/useCurrency';

const OrderDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { activeCountry } = useCountry();
    const { format } = useCurrency();
    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [actionLoading, setActionLoading] = useState(false);

    useEffect(() => {
        fetchOrder();
    }, [id]);

    const fetchOrder = async () => {
        setLoading(true);
        try {
            const countryParam = activeCountry?._id ? `?countryId=${activeCountry._id}` : '';
            const res = await api.get(`/orders/${id}${countryParam}`);
            setOrder(res.data.data);
        } catch (err) {
            setError('Failed to load order');
        } finally {
            setLoading(false);
        }
    };

    const handleStatusChange = async (newStatus) => {
        if (!window.confirm(`Are you sure you want to change status to ${newStatus}?`)) return;

        setActionLoading(true);
        try {
            const countryParam = activeCountry?._id ? `?countryId=${activeCountry._id}` : '';
            await api.put(`/orders/${id}/status${countryParam}`, { status: newStatus });
            fetchOrder(); // Reload to get updates logs and allocated check
            toast.success(`Order status updated to ${newStatus}`);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Status update failed');
        } finally {
            setActionLoading(false);
        }
    };

    const formatOrderDetails = () => {
        if (!order) return '';

        const itemsList = order.items.map((item) => {
            const cartonSize = item.product?.cartonSize || 1;
            const cartons = Math.floor(item.quantity / cartonSize);
            const pieces = item.quantity % cartonSize;
            
            // Format quantity display
            let quantityDisplay;
            if (cartonSize > 1) {
                if (cartons > 0 && pieces > 0) {
                    // Both cartons and pieces
                    quantityDisplay = `${cartons} ctn, ${pieces} pcs`;
                } else if (cartons > 0) {
                    // Only cartons
                    quantityDisplay = `${cartons} ctn`;
                } else {
                    // Only pieces
                    quantityDisplay = `${pieces} pcs`;
                }
            } else {
                // No carton size, just show pieces
                quantityDisplay = `${item.quantity} pcs`;
            }
            
            return `${item.product?.name} - ${quantityDisplay}`;
        }).join('\n');

        return `${order.customer?.name}
${order.customer?.address}
${order.customer?.phone || 'N/A'}

${itemsList}
`;
    };

    const handleCopyDetails = async () => {
        try {
            const details = formatOrderDetails();
            await navigator.clipboard.writeText(details);
            toast.success('Order details copied to clipboard!');
        } catch (err) {
            toast.error('Failed to copy to clipboard');
            console.error('Copy failed:', err);
        }
    };

    const handleShare = async () => {
        const details = formatOrderDetails();
        
        // Check if Web Share API is available
        if (navigator.share) {
            try {
                await navigator.share({
                    title: `Order #${order.orderNumber || order._id.slice(-6).toUpperCase()}`,
                    text: details
                });
                toast.success('Order details shared!');
            } catch (err) {
                // User cancelled or share failed
                if (err.name !== 'AbortError') {
                    console.error('Share failed:', err);
                    // Fallback to copy
                    handleCopyDetails();
                }
            }
        } else {
            // Fallback to copy if share not supported
            handleCopyDetails();
            toast.info('Share not supported. Details copied to clipboard instead.');
        }
    };

    const handleDownloadReceipt = async (regenerate = false) => {
        try {
            toast.info(regenerate ? 'Regenerating receipt...' : 'Downloading receipt...');
            
            // Get the token from localStorage
            const token = localStorage.getItem('token');
            
            // Build URL with regenerate parameter if needed
            const countryParam = activeCountry?._id ? `&countryId=${activeCountry._id}` : '';
            const url = `${api.defaults.baseURL}/orders/${id}/receipt${regenerate ? `?regenerate=true${countryParam}` : countryParam ? `?${countryParam.slice(1)}` : ''}`;
            
            // Fetch the PDF
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to download receipt');
            }

            // Get the blob
            const blob = await response.blob();
            
            // Verify it's a valid PDF
            if (blob.size === 0) {
                throw new Error('Received empty PDF file');
            }
            
            // Create download link
            const url2 = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url2;
            link.download = `receipt-order-${order.orderNumber || order._id.slice(-6).toUpperCase()}.pdf`;
            document.body.appendChild(link);
            link.click();
            
            // Cleanup
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url2);
            
            toast.success('Receipt downloaded successfully!');
        } catch (err) {
            console.error('Download failed:', err);
            toast.error(err.message || 'Failed to download receipt');
        }
    };

    const handleDownloadInvoice = async (regenerate = false) => {
        try {
            toast.info(regenerate ? 'Regenerating invoice...' : 'Downloading invoice...');
            
            // Get the token from localStorage
            const token = localStorage.getItem('token');
            
            // Build URL with regenerate parameter if needed
            const url =
                `${api.defaults.baseURL}/orders/${id}/invoice` +
                `?countryId=${activeCountry?._id || ''}${regenerate ? '&regenerate=true' : ''}`;
            
            // Fetch the PDF
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to download invoice');
            }

            // Get the blob
            const blob = await response.blob();
            
            // Verify it's a valid PDF
            if (blob.size === 0) {
                throw new Error('Received empty PDF file');
            }
            
            // Create download link
            const url2 = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url2;
            link.download = `invoice-order-${order.orderNumber || order._id.slice(-6).toUpperCase()}.pdf`;
            document.body.appendChild(link);
            link.click();
            
            // Cleanup
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url2);
            
            toast.success('Invoice downloaded successfully!');
        } catch (err) {
            console.error('Download failed:', err);
            toast.error(err.message || 'Failed to download invoice');
        }
    };

    if (loading) return <Spinner fullPage />;
    if (error || !order) return <div className="page-container"><div className="alert alert-error">{error || 'Order not found'}</div></div>;

    return (
        <div className="page-container">
            <div className="page-header" style={{ marginBottom: '2rem' }}>
                <div>
                    <button
                        className="btn btn-secondary"
                        onClick={() => navigate('/orders')}
                        style={{ 
                            marginBottom: '0.5rem', 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '0.5rem',
                            padding: '6px 12px',
                            fontSize: '0.85rem'
                        }}
                    >
                        <FiArrowLeft /> Back to Orders
                    </button>
                    <h1 style={{ margin: '0.5rem 0 0 0', fontSize: '1.75rem', color: '#1E293B' }}>
                        Order #{order.orderNumber || order._id.slice(-6).toUpperCase()}
                    </h1>
                    <p style={{ color: '#64748B', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                        Created on {new Date(order.createdAt).toLocaleDateString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                        })}
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    {/* Copy and Share Buttons */}
                    <button
                        className="btn btn-secondary"
                        onClick={handleCopyDetails}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '6px 12px', fontSize: '0.85rem' }}
                        title="Copy order details to clipboard"
                    >
                        <FiCopy size={14} /> Copy
                    </button>
                    <button
                        className="btn btn-secondary"
                        onClick={handleShare}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '6px 12px', fontSize: '0.85rem' }}
                        title="Share order details"
                    >
                        <FiShare2 size={14} /> Share
                    </button>

                    {/* Status Change Buttons */}
                    <PermissionGuard permission={PERMISSIONS.MANAGE_ORDERS}>
                        {(order.status === 'PENDING' || order.status === 'CONFIRMED') && (
                            <button
                                className="btn btn-secondary"
                                onClick={() => navigate(`/orders/${id}/edit`)}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '6px 12px', fontSize: '0.85rem' }}
                            >
                                <FiEdit2 size={14} /> Edit Order
                            </button>
                        )}
                        {order.status === 'PENDING' && (
                            <>
                                <button
                                    className="btn btn-primary"
                                    onClick={() => handleStatusChange('CONFIRMED')}
                                    disabled={actionLoading}
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '6px 12px', fontSize: '0.85rem' }}
                                >
                                    <FiCheck size={14} /> Confirm
                                </button>
                                <button
                                    className="btn btn-danger"
                                    onClick={() => handleStatusChange('CANCELLED')}
                                    disabled={actionLoading}
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '6px 12px', fontSize: '0.85rem' }}
                                >
                                    <FiX size={14} /> Cancel
                                </button>
                            </>
                        )}
                    </PermissionGuard>
                </div>
            </div>

            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                {/* Status and Total Banner */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                    gap: '1rem',
                    marginBottom: '2rem'
                }}>
                    <div style={{
                        padding: '1.5rem',
                        background: order.status === 'CONFIRMED' ? '#D1FAE5' : order.status === 'CANCELLED' ? '#FEE2E2' : '#FEF3C7',
                        border: `2px solid ${order.status === 'CONFIRMED' ? '#6EE7B7' : order.status === 'CANCELLED' ? '#FCA5A5' : '#FCD34D'}`,
                        borderRadius: '12px'
                    }}>
                        <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '0.5rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Order Status
                        </div>
                        <div style={{
                            fontSize: '1.5rem',
                            fontWeight: 700,
                            color: order.status === 'CONFIRMED' ? '#065F46' : order.status === 'CANCELLED' ? '#991B1B' : '#92400E'
                        }}>
                            {order.status}
                        </div>
                    </div>

                    <div style={{
                        padding: '1.5rem',
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        borderRadius: '12px',
                        color: '#fff'
                    }}>
                        <div style={{ fontSize: '0.75rem', marginBottom: '0.5rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', opacity: 0.9 }}>
                            Total Amount
                        </div>
                        <div style={{ fontSize: '2rem', fontWeight: 800, lineHeight: '1' }}>
                            {format(order.totalAmount)}
                        </div>
                        {order.discountAmount > 0 && (
                            <div style={{ fontSize: '0.8rem', marginTop: '0.5rem', opacity: 0.9 }}>
                                Includes <span style={{ fontWeight: 600 }}>{format(order.discountAmount)}</span> discount
                            </div>
                        )}
                        {order.deliveryFee > 0 && (
                            <div style={{ fontSize: '0.8rem', marginTop: '0.5rem', opacity: 0.9 }}>
                                Includes <span style={{ fontWeight: 600 }}>{format(order.deliveryFee)}</span> delivery fee
                            </div>
                        )}
                    </div>

                    <div style={{
                        padding: '1.5rem',
                        background: '#F0F9FF',
                        border: '2px solid #BAE6FD',
                        borderRadius: '12px'
                    }}>
                        <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '0.5rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Items Count
                        </div>
                        <div style={{ fontSize: '2rem', fontWeight: 700, color: '#0284C7' }}>
                            {order.items?.length || 0}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#0C4A6E', marginTop: '0.25rem' }}>
                            {order.items?.reduce((sum, item) => sum + item.quantity, 0).toLocaleString()} total pieces
                        </div>
                    </div>
                </div>

                {/* Customer and Order Info */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                    <div style={{
                        padding: '1.5rem',
                        background: '#fff',
                        borderRadius: '12px',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
                    }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#1E293B', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '2px solid #E2E8F0' }}>
                            Customer Information
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div>
                                <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '0.25rem' }}>Name</div>
                                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1E293B' }}>{order.customer?.name}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '0.25rem' }}>Address</div>
                                <div style={{ fontSize: '0.85rem', color: '#475569' }}>{order.customer?.address}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '0.25rem' }}>Phone</div>
                                <div style={{ fontSize: '0.9rem', color: '#1E293B', fontWeight: 500 }}>{order.customer?.phone || 'N/A'}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '0.25rem' }}>Email</div>
                                <div style={{ fontSize: '0.9rem', color: '#4880FF', fontWeight: 500 }}>{order.customer?.email || 'N/A'}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '0.25rem' }}>Country</div>
                                <div style={{ fontSize: '0.9rem', color: '#1E293B', fontWeight: 500 }}>{order.customer?.country || 'Nigeria'}</div>
                            </div>
                        </div>
                    </div>

                    <div style={{
                        padding: '1.5rem',
                        background: '#fff',
                        borderRadius: '12px',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
                    }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#1E293B', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '2px solid #E2E8F0' }}>
                            Order Details
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div>
                                <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '0.25rem' }}>Order ID</div>
                                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1E293B', fontFamily: 'monospace' }}>
                                    #{order._id.slice(-6).toUpperCase()}
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '0.25rem' }}>Warehouse</div>
                                <div style={{ fontSize: '0.9rem', color: '#1E293B', fontWeight: 500 }}>{order.warehouse?.name}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '0.25rem' }}>Region</div>
                                <div style={{ fontSize: '0.9rem', color: '#1E293B', fontWeight: 500 }}>{order.region?.name || 'N/A'}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '0.25rem' }}>Channel</div>
                                <div style={{ fontSize: '0.9rem', color: '#1E293B', fontWeight: 500 }}>{order.channel || 'N/A'}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '0.25rem' }}>Order Type</div>
                                <div style={{ 
                                    fontSize: '0.9rem', 
                                    fontWeight: 600,
                                    color: order.orderType === 'WHOLESALE' ? '#10B981' : '#4880FF',
                                    display: 'inline-block',
                                    padding: '4px 8px',
                                    borderRadius: '4px',
                                    background: order.orderType === 'WHOLESALE' ? '#D1FAE5' : '#DBEAFE'
                                }}>
                                    {order.orderType || 'RETAIL'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Order Items */}
                <div style={{
                    padding: '1.5rem',
                    background: '#fff',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                    marginBottom: '2rem'
                }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#1E293B', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '2px solid #E2E8F0' }}>
                        Order Items
                    </h3>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #E2E8F0' }}>
                                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Product</th>
                                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>SKU</th>
                                    <th style={{ padding: '12px', textAlign: 'right', fontSize: '0.75rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Quantity</th>
                                    <th style={{ padding: '12px', textAlign: 'right', fontSize: '0.75rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Unit Price</th>
                                    <th style={{ padding: '12px', textAlign: 'right', fontSize: '0.75rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Subtotal</th>
                                </tr>
                            </thead>
                            <tbody>
                                {order.items.map((item, idx) => {
                                    const cartonSize = item.product?.cartonSize || 1;
                                    const cartons = Math.floor(item.quantity / cartonSize);
                                    const pieces = item.quantity % cartonSize;

                                    return (
                                        <tr key={idx} style={{ borderBottom: idx < order.items.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                                            <td style={{ padding: '16px 12px' }}>
                                                <div style={{ fontWeight: 600, color: '#1E293B', marginBottom: '0.25rem' }}>
                                                    {item.product?.name}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                                                    Carton Size: {cartonSize}
                                                </div>
                                            </td>
                                            <td style={{ padding: '16px 12px' }}>
                                                <code style={{
                                                    fontSize: '0.75rem',
                                                    color: '#64748B',
                                                    background: '#F1F5F9',
                                                    padding: '4px 8px',
                                                    borderRadius: '4px'
                                                }}>
                                                    {item.product?.sku}
                                                </code>
                                            </td>
                                            <td style={{ padding: '16px 12px', textAlign: 'right' }}>
                                                <div style={{ fontWeight: 700, color: '#1E293B', fontSize: '0.95rem' }}>
                                                    {item.quantity} pcs
                                                </div>
                                                {cartonSize > 1 && (
                                                    <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.25rem' }}>
                                                        ({cartons} ctn, {pieces} pcs)
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: '16px 12px', textAlign: 'right', color: '#64748B', fontSize: '0.9rem' }}>
                                                {format(item.price || 0)}
                                            </td>
                                            <td style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 700, color: '#10B981', fontSize: '0.95rem' }}>
                                                {format(item.quantity * (item.price || 0))}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                {order.discountAmount > 0 || order.deliveryFee > 0 ? (
                                    <>
                                        <tr style={{ borderTop: '3px solid #E2E8F0' }}>
                                            <td colSpan="4" style={{ padding: '16px 12px 6px', textAlign: 'right', fontSize: '0.9rem', color: '#64748B' }}>
                                                Subtotal:
                                            </td>
                                            <td style={{ padding: '16px 12px 6px', textAlign: 'right', fontSize: '1rem', color: '#1E293B', fontWeight: 500 }}>
                                                {format(order.subtotal || (order.totalAmount + order.discountAmount - (order.deliveryFee || 0)))}
                                            </td>
                                        </tr>
                                        {order.discountAmount > 0 && (
                                            <tr>
                                                <td colSpan="4" style={{ padding: '6px 12px', textAlign: 'right', fontSize: '0.9rem', color: '#EF4444' }}>
                                                    Discount {order.discountType === 'global' ? '(Global)' : order.discountType === 'individual' ? '(Individual Items)' : ''}:
                                                </td>
                                                <td style={{ padding: '6px 12px', textAlign: 'right', fontSize: '1rem', color: '#EF4444', fontWeight: 500 }}>
                                                    - {format(order.discountAmount)}
                                                </td>
                                            </tr>
                                        )}
                                        {order.deliveryFee > 0 && (
                                            <tr>
                                                <td colSpan="4" style={{ padding: '6px 12px', textAlign: 'right', fontSize: '0.9rem', color: '#64748B' }}>
                                                    Delivery Fee:
                                                </td>
                                                <td style={{ padding: '6px 12px', textAlign: 'right', fontSize: '1rem', color: '#1E293B', fontWeight: 500 }}>
                                                    + {format(order.deliveryFee)}
                                                </td>
                                            </tr>
                                        )}
                                        <tr style={{ borderTop: '1px solid #E2E8F0' }}>
                                            <td colSpan="4" style={{ padding: '12px', textAlign: 'right', fontSize: '1rem', fontWeight: 700, color: '#1E293B' }}>
                                                Final Total Amount:
                                            </td>
                                            <td style={{ padding: '12px', textAlign: 'right', fontSize: '1.25rem', fontWeight: 800, color: '#4880FF' }}>
                                                {format(order.totalAmount)}
                                            </td>
                                        </tr>
                                    </>
                                ) : (
                                    <tr style={{ borderTop: '3px solid #E2E8F0' }}>
                                        <td colSpan="4" style={{ padding: '16px 12px', textAlign: 'right', fontSize: '1rem', fontWeight: 700, color: '#1E293B' }}>
                                            Total Amount:
                                        </td>
                                        <td style={{ padding: '16px 12px', textAlign: 'right', fontSize: '1.25rem', fontWeight: 800, color: '#4880FF' }}>
                                            {format(order.totalAmount)}
                                        </td>
                                    </tr>
                                )}
                            </tfoot>
                        </table>
                    </div>
                </div>

                {/* Order Log */}
                <div style={{
                    padding: '1.5rem',
                    background: '#fff',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
                }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#1E293B', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '2px solid #E2E8F0' }}>
                        Order Activity Log
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {order.logs.map((log, i) => (
                            <div key={i} style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: '12px',
                                background: '#F8FAFC',
                                borderRadius: '8px',
                                gap: '1rem',
                                flexWrap: 'wrap'
                            }}>
                                <span style={{
                                    fontSize: '0.8rem',
                                    color: '#64748B',
                                    minWidth: '180px',
                                    fontFamily: 'monospace'
                                }}>
                                    {new Date(log.date).toLocaleString()}
                                </span>
                                <span style={{
                                    padding: '4px 12px',
                                    borderRadius: '6px',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    background: log.status === 'CONFIRMED' ? '#D1FAE5' : log.status === 'CANCELLED' ? '#FEE2E2' : '#FEF3C7',
                                    color: log.status === 'CONFIRMED' ? '#065F46' : log.status === 'CANCELLED' ? '#991B1B' : '#92400E'
                                }}>
                                    {log.status}
                                </span>
                                <span style={{ fontSize: '0.85rem', color: '#475569' }}>
                                    by <strong>{log.changedBy?.email || 'System'}</strong>
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Download Buttons Section */}
                <div style={{
                    padding: '1.5rem',
                    background: '#F8FAFC',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    marginTop: '1.5rem',
                    display: 'flex',
                    gap: '0.75rem',
                    flexWrap: 'wrap',
                    alignItems: 'center'
                }}>
                    {/* Receipt Download */}
                    <button
                        className="btn btn-primary"
                        onClick={() => handleDownloadReceipt(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        title="Download PDF receipt"
                    >
                        <FiDownload /> Download Receipt
                    </button>

                    {/* Invoice Download (for wholesale orders) */}
                    {order.orderType === 'WHOLESALE' && (
                        <button
                            className="btn btn-primary"
                            onClick={() => handleDownloadInvoice(true)}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#10B981' }}
                            title="Download PDF invoice"
                        >
                            <FiDownload /> Download Invoice
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default OrderDetail;
