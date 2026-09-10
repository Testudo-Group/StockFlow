import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import api from '../utils/api';
import Spinner from '../components/Spinner';
import ExportButton from '../components/ExportButton';
import { useCountry } from '../context/CountryContext';
import useCurrency from '../hooks/useCurrency';

const CustomerAnalytics = () => {
    const { activeCountry } = useCountry();
    const { formatShort, symbol } = useCurrency();
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showRecurringOnly, setShowRecurringOnly] = useState(false);
    const [sortKey, setSortKey] = useState('totalOrders');
    const [sortDir, setSortDir] = useState('desc');

    const handleSort = (key) => {
        if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDir('desc'); }
    };

    const sorted = [...customers].sort((a, b) => {
        let av = a[sortKey], bv = b[sortKey];
        if (sortKey === 'lastOrderDate') { av = new Date(av); bv = new Date(bv); }
        if (av < bv) return sortDir === 'asc' ? -1 : 1;
        if (av > bv) return sortDir === 'asc' ? 1 : -1;
        return 0;
    });

    const SortTh = ({ label, field }) => {
        const active = sortKey === field;
        return (
            <th onClick={() => handleSort(field)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                {label} {active ? (sortDir === 'asc' ? '▲' : '▼') : <span style={{ opacity: 0.3 }}>▼</span>}
            </th>
        );
    };

    useEffect(() => {
        if (activeCountry?._id) fetchCustomerAnalytics();
    }, [showRecurringOnly, activeCountry?._id]);

    const fetchCustomerAnalytics = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (showRecurringOnly) params.append('recurring', 'true');
            if (activeCountry?._id) params.append('countryId', activeCountry._id);
            const query = params.toString() ? `?${params.toString()}` : '';
            const res = await api.get(`/analytics/customers${query}`);
            setCustomers(res.data.data);
            setLoading(false);
        } catch (err) {
            toast.error('Failed to load customer analytics');
            setLoading(false);
        }
    };

    // Prepare export data
    const getExportData = () => {
        return customers.map(customer => ({
            name: customer.name || '',
            phone: customer.phone || '',
            email: customer.email || '',
            orderCount: customer.orderCount || 0,
            totalSpent: parseFloat((customer.totalSpent || 0).toFixed(2)),
            avgOrderValue: parseFloat((customer.avgOrderValue || 0).toFixed(2)),
            lastOrderDate: customer.lastOrderDate ? new Date(customer.lastOrderDate).toLocaleDateString() : ''
        }));
    };

    const exportColumns = [
        { key: 'name', label: 'Customer Name' },
        { key: 'phone', label: 'Phone' },
        { key: 'email', label: 'Email' },
        { key: 'orderCount', label: 'Total Orders' },
        { key: 'totalSpent', label: `Total Spent (${symbol})` },
        { key: 'avgOrderValue', label: `Avg Order Value (${symbol})` },
        { key: 'lastOrderDate', label: 'Last Order Date' }
    ];

    return (
        <div className="page-container">
            <div className="page-header">
                <h1>Customer Analytics</h1>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    {customers.length > 0 && (
                        <ExportButton
                            data={getExportData()}
                            columns={exportColumns}
                            filename={`customer-analytics-${new Date().toISOString().split('T')[0]}`}
                            label="Export"
                        />
                    )}
                    <div className="checkbox-group">
                        <input
                            type="checkbox"
                            id="recurringOnly"
                            checked={showRecurringOnly}
                            onChange={(e) => setShowRecurringOnly(e.target.checked)}
                        />
                        <label htmlFor="recurringOnly">Show Recurring Customers Only</label>
                    </div>
                </div>
            </div>

            {loading ? (
                <Spinner fullPage />
            ) : (
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Customer Name</th>
                                <th>Contact</th>
                                <SortTh label="Total Orders" field="totalOrders" />
                                <SortTh label="Total Spent" field="totalSpent" />
                                <SortTh label="Last Order" field="lastOrderDate" />
                                <th>Most Ordered Products</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.length > 0 ? (
                                sorted.map((customer, idx) => (
                                    <tr key={idx}>
                                        <td>
                                            <div className="cell-primary">{customer._id}</div>
                                            {customer.isRecurring && (
                                                <span className="status-badge active" style={{ fontSize: '0.7em', marginTop: '4px' }}>
                                                    Recurring
                                                </span>
                                            )}
                                        </td>
                                        <td>
                                            <div>{customer.customerPhone || 'N/A'}</div>
                                            <div className="cell-secondary">{customer.customerEmail || ''}</div>
                                        </td>
                                        <td>{customer.totalOrders}</td>
                                        <td>{formatShort(customer.totalSpent || 0)}</td>
                                        <td>{new Date(customer.lastOrderDate).toLocaleDateString()}</td>
                                        <td>
                                            <div style={{ maxWidth: '300px' }}>
                                                {customer.topProducts?.slice(0, 3).map((prod, i) => (
                                                    <div key={i} className="cell-secondary" style={{ marginBottom: '4px' }}>
                                                        <strong>{prod.name}</strong> ({prod.sku}) - {prod.quantity} pcs
                                                    </div>
                                                ))}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="6" className="text-center">
                                        No customers found
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default CustomerAnalytics;
