import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCountry } from '../context/CountryContext';
import api from '../utils/api';
import { toast } from 'react-toastify';
import Spinner from '../components/Spinner';
import { FiGlobe, FiPlus, FiToggleLeft, FiToggleRight, FiUsers, FiEdit2, FiX } from 'react-icons/fi';

const CountrySettings = () => {
    const { user } = useAuth();
    const { availableCountries, loadingCountries } = useCountry();

    const [countries, setCountries] = useState([]);
    const [loadingAll, setLoadingAll] = useState(true);
    const [newCountry, setNewCountry] = useState({
        name: '',
        isoCode: '',
        // Blank currency fields are filled in by the server from the ISO code.
        currencyCode: '',
        currencySymbol: '',
    });
    const [saving, setSaving] = useState(false);

    // Edit modal state
    const [editingCountry, setEditingCountry] = useState(null);
    const [editForm, setEditForm] = useState({
        name: '',
        isoCode: '',
        currencyCode: '',
        currencySymbol: '',
        currencyName: '',
        locale: '',
    });
    const [editSaving, setEditSaving] = useState(false);

    // User assignments state
    const [inventoryManagers, setInventoryManagers] = useState([]);
    const [assignments, setAssignments] = useState({}); // { userId: [countryId, ...] }
    const [savingAssignment, setSavingAssignment] = useState({});

    // Guard — non-admins should not reach this page
    if (user?.role !== 'ADMIN') {
        return (
            <div className="page-container" style={{ textAlign: 'center', paddingTop: '4rem' }}>
                <h2>403 — Access Denied</h2>
                <p>This page is only accessible to administrators.</p>
            </div>
        );
    }

    // Fetch all countries (including inactive)
    const fetchAllCountries = async () => {
        try {
            setLoadingAll(true);
            // Admin sees all — fetch without role restriction by using a separate endpoint
            // Our GET /api/countries returns active only for non-admins; for admin it returns all active
            // We use the same endpoint but also fetch inactive via a different approach
            const response = await api.get('/countries');
            setCountries(response.data.data || []);
        } catch {
            toast.error('Failed to load countries');
        } finally {
            setLoadingAll(false);
        }
    };

    // Fetch inventory managers
    const fetchInventoryManagers = async () => {
        try {
            const response = await api.get('/users?role=INVENTORY_MANAGER');
            const managers = response.data.data || [];
            setInventoryManagers(managers);

            // Fetch existing assignments for each manager
            const assignmentMap = {};
            await Promise.all(
                managers.map(async (m) => {
                    try {
                        const res = await api.get(`/countries/${m._id}/assignments`);
                        assignmentMap[m._id] = (res.data.data || []).map((c) => c._id);
                    } catch {
                        assignmentMap[m._id] = [];
                    }
                })
            );
            setAssignments(assignmentMap);
        } catch {
            toast.error('Failed to load inventory managers');
        }
    };

    useEffect(() => {
        fetchAllCountries();
        fetchInventoryManagers();
    }, []);

    const handleAddCountry = async (e) => {
        e.preventDefault();
        if (!newCountry.name.trim() || !newCountry.isoCode.trim()) {
            toast.error('Country name and ISO code are required');
            return;
        }
        try {
            setSaving(true);
            const response = await api.post('/countries', newCountry);
            setCountries((prev) => [...prev, response.data.data]);
            setNewCountry({ name: '', isoCode: '', currencyCode: '', currencySymbol: '' });
            toast.success('Country added');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to add country');
        } finally {
            setSaving(false);
        }
    };

    const handleToggleActive = async (country) => {
        if (country.isDefault) {
            toast.error('The default country cannot be deactivated');
            return;
        }
        try {
            const response = await api.patch(`/countries/${country._id}`, {
                isActive: !country.isActive,
            });
            setCountries((prev) =>
                prev.map((c) => (c._id === country._id ? response.data.data : c))
            );
            toast.success(`${country.name} ${country.isActive ? 'deactivated' : 'activated'}`);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to update country');
        }
    };

    const openEdit = (country) => {
        setEditingCountry(country);
        setEditForm({
            name: country.name,
            isoCode: country.isoCode,
            currencyCode: country.currencyCode || '',
            currencySymbol: country.currencySymbol || '',
            currencyName: country.currencyName || '',
            locale: country.locale || '',
        });
    };

    const closeEdit = () => {
        setEditingCountry(null);
        setEditForm({ name: '', isoCode: '', currencyCode: '', currencySymbol: '', currencyName: '', locale: '' });
    };

    const handleEditSave = async (e) => {
        e.preventDefault();
        if (!editForm.name.trim() || !editForm.isoCode.trim()) {
            toast.error('Name and ISO code are required');
            return;
        }
        if (!editForm.currencyCode.trim() || !editForm.currencySymbol.trim()) {
            toast.error('Currency code and symbol are required');
            return;
        }
        if (editForm.currencyCode.trim().length !== 3) {
            toast.error('Currency code must be a 3-letter ISO 4217 code (e.g. GHS)');
            return;
        }
        try {
            setEditSaving(true);
            const response = await api.patch(`/countries/${editingCountry._id}`, {
                name: editForm.name.trim(),
                isoCode: editForm.isoCode.trim().toUpperCase(),
                currencyCode: editForm.currencyCode.trim().toUpperCase(),
                currencySymbol: editForm.currencySymbol.trim(),
                currencyName: editForm.currencyName.trim(),
                locale: editForm.locale.trim() || 'en-US',
            });
            setCountries((prev) =>
                prev.map((c) => (c._id === editingCountry._id ? response.data.data : c))
            );
            toast.success('Country updated');
            closeEdit();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to update country');
        } finally {
            setEditSaving(false);
        }
    };

    const handleAssignmentChange = (userId, countryId, checked) => {
        setAssignments((prev) => {
            const current = prev[userId] || [];
            if (checked) {
                return { ...prev, [userId]: [...current, countryId] };
            } else {
                return { ...prev, [userId]: current.filter((id) => id !== countryId) };
            }
        });
    };

    const handleSaveAssignments = async (userId) => {
        try {
            setSavingAssignment((prev) => ({ ...prev, [userId]: true }));
            await api.put(`/countries/${userId}/assignments`, {
                countryIds: assignments[userId] || [],
            });
            toast.success('Assignments saved');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save assignments');
        } finally {
            setSavingAssignment((prev) => ({ ...prev, [userId]: false }));
        }
    };

    if (loadingAll) return <Spinner fullPage />;

    return (
        <div className="page-container">
            <div className="page-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <FiGlobe size={22} color="#4880FF" />
                    <h1 className="page-title">Country Settings</h1>
                </div>
                <p className="page-subtitle">Manage countries and assign inventory managers.</p>
            </div>

            {/* ── Section 1: Countries ── */}
            <div className="card" style={{ marginBottom: '2rem' }}>
                <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>Countries</h2>
                </div>

                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Country</th>
                            <th>ISO Code</th>
                            <th>Currency</th>
                            <th>Status</th>
                            <th>Default</th>
                            <th>Active</th>
                            <th>Edit</th>
                        </tr>
                    </thead>
                    <tbody>
                        {countries.map((country) => (
                            <tr key={country._id}>
                                <td style={{ fontWeight: 500 }}>{country.name}</td>
                                <td>
                                    <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: '#64748B' }}>
                                        {country.isoCode}
                                    </span>
                                </td>
                                <td>
                                    {country.currencyCode ? (
                                        <span style={{ fontSize: '0.85rem', color: '#1E293B' }}>
                                            <strong style={{ fontSize: '1rem' }}>{country.currencySymbol}</strong>
                                            <span style={{ marginLeft: '6px', fontFamily: 'monospace', color: '#64748B' }}>
                                                {country.currencyCode}
                                            </span>
                                        </span>
                                    ) : (
                                        <span style={{ fontSize: '0.78rem', color: '#B45309' }}>Not set</span>
                                    )}
                                </td>
                                <td>
                                    <span style={{
                                        padding: '2px 10px',
                                        borderRadius: '4px',
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                        background: country.isActive ? '#D1FAE5' : '#FEE2E2',
                                        color: country.isActive ? '#065F46' : '#991B1B',
                                    }}>
                                        {country.isActive ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                                <td>{country.isDefault ? '✓' : '—'}</td>
                                <td>
                                    <button
                                        onClick={() => handleToggleActive(country)}
                                        disabled={country.isDefault}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            cursor: country.isDefault ? 'not-allowed' : 'pointer',
                                            color: country.isDefault ? '#CBD5E1' : country.isActive ? '#EF4444' : '#10B981',
                                            fontSize: '1.2rem',
                                        }}
                                        title={country.isDefault ? 'Cannot deactivate default country' : country.isActive ? 'Deactivate' : 'Activate'}
                                    >
                                        {country.isActive ? <FiToggleRight /> : <FiToggleLeft />}
                                    </button>
                                </td>
                                <td>
                                    <button
                                        onClick={() => openEdit(country)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4880FF', fontSize: '1rem' }}
                                        title="Edit country"
                                    >
                                        <FiEdit2 />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* Add Country Form */}
                <div style={{ padding: '1.25rem', borderTop: '1px solid #E2E8F0' }}>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <FiPlus /> Add New Country
                    </h3>
                    <form onSubmit={handleAddCountry} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '0.8rem', color: '#64748B' }}>Country Name</label>
                            <input
                                type="text"
                                placeholder="e.g. Ghana"
                                value={newCountry.name}
                                onChange={(e) => setNewCountry((p) => ({ ...p, name: e.target.value }))}
                                className="form-input"
                                style={{ width: '200px' }}
                            />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '0.8rem', color: '#64748B' }}>ISO Code</label>
                            <input
                                type="text"
                                placeholder="e.g. GH"
                                value={newCountry.isoCode}
                                onChange={(e) => setNewCountry((p) => ({ ...p, isoCode: e.target.value.toUpperCase() }))}
                                maxLength={3}
                                className="form-input"
                                style={{ width: '100px' }}
                            />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '0.8rem', color: '#64748B' }}>Currency Code</label>
                            <input
                                type="text"
                                placeholder="auto (e.g. GHS)"
                                value={newCountry.currencyCode}
                                onChange={(e) => setNewCountry((p) => ({ ...p, currencyCode: e.target.value.toUpperCase() }))}
                                maxLength={3}
                                className="form-input"
                                style={{ width: '140px' }}
                            />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '0.8rem', color: '#64748B' }}>Symbol</label>
                            <input
                                type="text"
                                placeholder="auto"
                                value={newCountry.currencySymbol}
                                onChange={(e) => setNewCountry((p) => ({ ...p, currencySymbol: e.target.value }))}
                                maxLength={6}
                                className="form-input"
                                style={{ width: '90px' }}
                            />
                        </div>
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? 'Adding...' : 'Add Country'}
                        </button>
                        <p style={{ width: '100%', margin: '0.5rem 0 0', fontSize: '0.78rem', color: '#94A3B8' }}>
                            Leave currency blank to use the standard currency for that ISO code.
                            Prices are entered separately per country and are never converted.
                        </p>
                    </form>
                </div>
            </div>

            {/* ── Section 2: User Assignments ── */}
            <div className="card">
                <div className="card-header">
                    <h2 style={{ fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <FiUsers /> Inventory Manager Country Assignments
                    </h2>
                    <p style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '4px' }}>
                        Leave all unchecked to give a manager access to all countries.
                    </p>
                </div>

                {inventoryManagers.length === 0 ? (
                    <p style={{ padding: '1.5rem', color: '#A3AED0', fontStyle: 'italic' }}>
                        No inventory managers found.
                    </p>
                ) : (
                    inventoryManagers.map((manager) => (
                        <div key={manager._id} style={{ padding: '1.25rem', borderBottom: '1px solid #E2E8F0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                <div>
                                    <span style={{ fontWeight: 600 }}>{manager.username}</span>
                                    <span style={{ fontSize: '0.8rem', color: '#64748B', marginLeft: '0.5rem' }}>{manager.email}</span>
                                </div>
                                <button
                                    className="btn btn-primary"
                                    style={{ fontSize: '0.8rem', padding: '4px 14px' }}
                                    onClick={() => handleSaveAssignments(manager._id)}
                                    disabled={savingAssignment[manager._id]}
                                >
                                    {savingAssignment[manager._id] ? 'Saving...' : 'Save'}
                                </button>
                            </div>
                            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                {countries.filter((c) => c.isActive).map((country) => (
                                    <label key={country._id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={(assignments[manager._id] || []).includes(country._id)}
                                            onChange={(e) => handleAssignmentChange(manager._id, country._id, e.target.checked)}
                                        />
                                        {country.name}
                                    </label>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* ── Edit Country Modal ── */}
            {editingCountry && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '440px' }}>
                        <div className="modal-header">
                            <h2>Edit Country</h2>
                            <button onClick={closeEdit} className="btn-close" title="Close"><FiX /></button>
                        </div>
                        <form onSubmit={handleEditSave}>
                            <div className="form-group">
                                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Country Name</label>
                                <input
                                    type="text"
                                    value={editForm.name}
                                    onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                                    className="form-input"
                                    placeholder="e.g. Ghana"
                                    disabled={editingCountry.isDefault}
                                />
                                {editingCountry.isDefault && (
                                    <small style={{ color: '#94A3B8' }}>The default country name cannot be changed.</small>
                                )}
                            </div>
                            <div className="form-group">
                                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>ISO Code</label>
                                <input
                                    type="text"
                                    value={editForm.isoCode}
                                    onChange={(e) => setEditForm((p) => ({ ...p, isoCode: e.target.value.toUpperCase() }))}
                                    className="form-input"
                                    placeholder="e.g. GH"
                                    maxLength={3}
                                    disabled={editingCountry.isDefault}
                                />
                            </div>
                            <div
                                style={{
                                    marginTop: '0.5rem',
                                    paddingTop: '0.75rem',
                                    borderTop: '1px solid #E2E8F0',
                                }}
                            >
                                <h3 style={{ fontSize: '0.85rem', fontWeight: 600, margin: '0 0 0.25rem' }}>
                                    Currency
                                </h3>
                                <p style={{ fontSize: '0.75rem', color: '#94A3B8', margin: '0 0 0.75rem' }}>
                                    Used to display every amount for this country. Changing it relabels
                                    figures — it does not convert them.
                                </p>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Code</label>
                                        <input
                                            type="text"
                                            value={editForm.currencyCode}
                                            onChange={(e) => setEditForm((p) => ({ ...p, currencyCode: e.target.value.toUpperCase() }))}
                                            className="form-input"
                                            placeholder="e.g. GHS"
                                            maxLength={3}
                                        />
                                    </div>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Symbol</label>
                                        <input
                                            type="text"
                                            value={editForm.currencySymbol}
                                            onChange={(e) => setEditForm((p) => ({ ...p, currencySymbol: e.target.value }))}
                                            className="form-input"
                                            placeholder="e.g. ₵"
                                            maxLength={6}
                                        />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Currency Name</label>
                                    <input
                                        type="text"
                                        value={editForm.currencyName}
                                        onChange={(e) => setEditForm((p) => ({ ...p, currencyName: e.target.value }))}
                                        className="form-input"
                                        placeholder="e.g. Ghanaian Cedi"
                                    />
                                </div>

                                <div className="form-group">
                                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Number Format Locale</label>
                                    <input
                                        type="text"
                                        value={editForm.locale}
                                        onChange={(e) => setEditForm((p) => ({ ...p, locale: e.target.value }))}
                                        className="form-input"
                                        placeholder="e.g. en-GH"
                                    />
                                    <small style={{ color: '#94A3B8' }}>
                                        Controls thousands and decimal separators.
                                    </small>
                                </div>
                            </div>

                            <div className="modal-actions">
                                <button type="button" onClick={closeEdit} className="btn btn-secondary" disabled={editSaving}>
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={editSaving}
                                >
                                    {editSaving ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CountrySettings;
