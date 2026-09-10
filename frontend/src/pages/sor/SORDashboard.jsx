import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FiUsers, FiAlertTriangle, FiDollarSign, FiClock } from 'react-icons/fi';
import api from '../../utils/api';
import Spinner from '../../components/Spinner';
import { useCountry } from '../../context/CountryContext';
import useCurrency from '../../hooks/useCurrency';

const getDefaultDates = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(1); // first of current month
    return {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
    };
};

const SORDashboard = () => {
    const { activeCountry } = useCountry();
    const { format } = useCurrency();
    const formatCurrency = (amount) => format(Number(amount || 0));
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const defaults = getDefaultDates();
    const [startDate, setStartDate] = useState(defaults.startDate);
    const [endDate, setEndDate] = useState(defaults.endDate);

    const fetchDashboard = useCallback(async () => {
        if (!activeCountry?._id) return;
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (startDate) params.append('startDate', startDate);
            if (endDate) params.append('endDate', endDate);
            params.append('countryId', activeCountry._id);
            const res = await api.get(`/sor/dashboard?${params.toString()}`);
            setData(res.data.data);
        } catch (err) {
            toast.error('Failed to load SOR dashboard');
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate]);

    useEffect(() => {
        fetchDashboard();
    }, [fetchDashboard, activeCountry?._id]);

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1>SOR Dashboard</h1>
                    <p style={{ color: '#64748B', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                        Sales on Return — outstanding liabilities and payment overview
                    </p>
                </div>
            </div>

            {/* Date range filter */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                flexWrap: 'wrap',
                marginBottom: '2rem',
                padding: '1rem 1.25rem',
                background: '#F8FAFC',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
            }}>
                <span style={{ fontSize: '0.875rem', color: '#64748B', fontWeight: 500 }}>Payments period:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        style={{
                            padding: '6px 10px',
                            border: '1px solid #E2E8F0',
                            borderRadius: '6px',
                            fontSize: '0.875rem',
                            color: '#1E293B',
                        }}
                    />
                    <span style={{ color: '#94A3B8', fontSize: '0.875rem' }}>to</span>
                    <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        style={{
                            padding: '6px 10px',
                            border: '1px solid #E2E8F0',
                            borderRadius: '6px',
                            fontSize: '0.875rem',
                            color: '#1E293B',
                        }}
                    />
                </div>
                <span style={{ fontSize: '0.8rem', color: '#94A3B8' }}>
                    (Payments in Range updates with date filter; liabilities are always current)
                </span>
            </div>

            {loading ? (
                <Spinner fullPage />
            ) : !data ? (
                <div className="text-center" style={{ padding: '4rem 2rem', color: '#64748B' }}>
                    Failed to load dashboard data.
                </div>
            ) : (
                <>
                    {/* Summary stat cards */}
                    <div className="stat-cards-row" style={{ marginBottom: '2rem' }}>
                        <div className="stat-card" style={{ borderLeft: '3px solid #4880FF' }}>
                            <div className="stat-card-icon" style={{ color: '#4880FF' }}><FiUsers /></div>
                            <div className="stat-card-label">Active SOR Customers</div>
                            <div className="stat-card-value">{data.activeCustomerCount ?? 0}</div>
                            <div style={{ fontSize: '0.75rem', color: '#A3AED0', marginTop: '0.25rem' }}>
                                Customers with outstanding liability
                            </div>
                        </div>

                        <div className="stat-card" style={{ borderLeft: '3px solid #ef4444' }}>
                            <div className="stat-card-icon" style={{ color: '#ef4444' }}><FiAlertTriangle /></div>
                            <div className="stat-card-label">Total Outstanding Liability</div>
                            <div className="stat-card-value" style={{ color: '#ef4444', fontSize: '1.3rem' }}>
                                {formatCurrency(data.totalLiability)}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#A3AED0', marginTop: '0.25rem' }}>
                                Across all active customers
                            </div>
                        </div>

                        <div className="stat-card" style={{ borderLeft: '3px solid #10b981' }}>
                            <div className="stat-card-icon" style={{ color: '#10b981' }}><FiDollarSign /></div>
                            <div className="stat-card-label">Payments in Range</div>
                            <div className="stat-card-value" style={{ color: '#10b981', fontSize: '1.3rem' }}>
                                {formatCurrency(data.totalPaymentsInRange)}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#A3AED0', marginTop: '0.25rem' }}>
                                {startDate} — {endDate}
                            </div>
                        </div>
                    </div>

                    {/* Overdue orders section */}
                    {data.overdue && (data.overdue.count > 0) && (
                        <div style={{
                            background: '#FEF2F2',
                            border: '1px solid #FCA5A5',
                            borderRadius: '8px',
                            padding: '1rem 1.5rem',
                            marginBottom: '2rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '1rem',
                            flexWrap: 'wrap',
                        }}>
                            <FiClock size={22} style={{ color: '#DC2626', flexShrink: 0 }} />
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, color: '#991B1B', fontSize: '0.95rem' }}>
                                    {data.overdue.count} Overdue Order{data.overdue.count !== 1 ? 's' : ''}
                                </div>
                                <div style={{ fontSize: '0.85rem', color: '#7F1D1D', marginTop: '0.2rem' }}>
                                    Total overdue value: <strong>{formatCurrency(data.overdue.totalValue)}</strong>
                                </div>
                            </div>
                        </div>
                    )}

                    {data.overdue && data.overdue.count === 0 && (
                        <div style={{
                            background: '#F0FDF4',
                            border: '1px solid #86EFAC',
                            borderRadius: '8px',
                            padding: '1rem 1.5rem',
                            marginBottom: '2rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '1rem',
                        }}>
                            <FiClock size={22} style={{ color: '#16A34A', flexShrink: 0 }} />
                            <div style={{ fontWeight: 500, color: '#166534', fontSize: '0.9rem' }}>
                                No overdue orders — all orders are within their expected timeframe.
                            </div>
                        </div>
                    )}

                    {/* Ranked customers table */}
                    <div style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <h2 style={{ margin: 0, fontSize: '1.05rem', color: '#1E293B' }}>
                            Customers by Outstanding Liability
                        </h2>
                        <span style={{ fontSize: '0.8rem', color: '#94A3B8' }}>
                            Ranked highest to lowest
                        </span>
                    </div>

                    <div className="table-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '60px' }}>Rank</th>
                                    <th>Name</th>
                                    <th>Phone</th>
                                    <th>Outstanding Liability</th>
                                </tr>
                            </thead>
                            <tbody>
                                {!data.rankedCustomers || data.rankedCustomers.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} style={{ textAlign: 'center', padding: '2.5rem', color: '#64748B' }}>
                                            No customers with outstanding liability.
                                        </td>
                                    </tr>
                                ) : (
                                    data.rankedCustomers.map((customer, idx) => (
                                        <tr key={customer._id}>
                                            <td>
                                                <span style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    width: '28px',
                                                    height: '28px',
                                                    borderRadius: '50%',
                                                    background: idx === 0 ? '#FEF3C7' : idx === 1 ? '#F1F5F9' : '#F8FAFC',
                                                    color: idx === 0 ? '#92400E' : '#475569',
                                                    fontWeight: 700,
                                                    fontSize: '0.8rem',
                                                }}>
                                                    {idx + 1}
                                                </span>
                                            </td>
                                            <td style={{ fontWeight: 500 }}>
                                                <Link
                                                    to={`/sor/customers/${customer._id}`}
                                                    style={{ color: '#4880FF', textDecoration: 'none' }}
                                                    onMouseEnter={(e) => e.target.style.textDecoration = 'underline'}
                                                    onMouseLeave={(e) => e.target.style.textDecoration = 'none'}
                                                >
                                                    {customer.name}
                                                </Link>
                                            </td>
                                            <td style={{ color: '#64748B' }}>{customer.phone}</td>
                                            <td>
                                                <span style={{ fontWeight: 600, color: '#DC2626' }}>
                                                    {formatCurrency(customer.outstandingLiability)}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
};

export default SORDashboard;
