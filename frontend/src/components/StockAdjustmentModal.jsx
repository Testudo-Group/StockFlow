import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { FiX } from 'react-icons/fi';
import api from '../utils/api';
import Spinner from '../components/Spinner';
import { useCountry } from '../context/CountryContext';

const StockAdjustmentModal = ({ isOpen, onClose, product, warehouse, onSuccess }) => {
    const { activeCountry } = useCountry();
    const [formData, setFormData] = useState({
        type: 'ADJUSTMENT',
        cartons: 0,
        pieces: 0,
        reason: '',
        selectedProduct: product?._id || '',
        selectedWarehouse: warehouse?._id || ''
    });

    const [loading, setLoading] = useState(false);
    const [products, setProducts] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [loadingData, setLoadingData] = useState(false);
    const [currentBalance, setCurrentBalance] = useState(null);

    // Fetch products and warehouses if not provided
    useEffect(() => {
        if (isOpen && (!product || !warehouse)) {
            setLoadingData(true);
            Promise.all([
                // Stock exists independently of pricing, so include products
                // that have no price set for this country.
                api.get('/products?limit=1000&includeUnpriced=true'),
                api.get('/warehouses')
            ]).then(([prodRes, whRes]) => {
                setProducts(prodRes.data.data);
                setWarehouses(whRes.data.data);
                setLoadingData(false);
            }).catch(err => {
                console.error('Failed to load data', err);
                setLoadingData(false);
            });
        }
    }, [isOpen, product, warehouse]);

    // Fetch current balance when product and warehouse are known
    useEffect(() => {
        const prodId = product?._id || formData.selectedProduct;
        const whId = warehouse?._id || formData.selectedWarehouse;
        if (isOpen && prodId && whId) {
            api.get(`/inventory/balance?productId=${prodId}&warehouseId=${whId}`)
                .then(res => {
                    const balances = res.data.data;
                    if (balances.length > 0) {
                        setCurrentBalance(balances[0].quantity || 0);
                    } else {
                        setCurrentBalance(0);
                    }
                })
                .catch(() => setCurrentBalance(null));
        } else {
            setCurrentBalance(null);
        }
    }, [isOpen, product, warehouse, formData.selectedProduct, formData.selectedWarehouse]);

    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            setFormData({
                type: 'ADJUSTMENT',
                cartons: 0,
                pieces: 0,
                reason: '',
                selectedProduct: product?._id || '',
                selectedWarehouse: warehouse?._id || ''
            });
            setCurrentBalance(null);
        }
    }, [isOpen, product, warehouse]);

    if (!isOpen) return null;

    // Get the actual product and warehouse objects
    const currentProduct = product || products.find(p => p._id === formData.selectedProduct);
    const currentWarehouse = warehouse || warehouses.find(w => w._id === formData.selectedWarehouse);
    const cartonSize = currentProduct?.cartonSize || 1;

    // Calculate total change preview
    const totalInput = (Number(formData.cartons) * cartonSize) + Number(formData.pieces);

    // For ADJUSTMENT (correction), the value entered IS the new stock level
    // For IN/OUT, the value is added/subtracted
    const isCorrection = formData.type === 'ADJUSTMENT';
    const isNegative = formData.type === 'OUT' || formData.type === 'TRANSFER_OUT';

    let displayChange;
    if (isCorrection) {
        displayChange = currentBalance !== null ? totalInput - currentBalance : totalInput;
    } else {
        displayChange = isNegative ? -totalInput : totalInput;
    }

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!currentProduct || !currentWarehouse) {
            toast.error('Please select both product and warehouse');
            return;
        }

        if (isCorrection && totalInput === 0 && currentBalance === 0) {
            toast.error('Stock is already at 0');
            return;
        }

        if (!isCorrection && totalInput === 0) {
            toast.error('Adjustment amount cannot be zero');
            return;
        }

        setLoading(true);
        try {
            let payload;
            if (isCorrection) {
                payload = {
                    product: currentProduct._id,
                    warehouse: currentWarehouse._id,
                    change: displayChange,
                    type: 'ADJUSTMENT',
                    reason: formData.reason || `Stock correction: set to ${totalInput} pieces`,
                    reference: `Manual Correction`,
                    setQuantity: totalInput,
                    countryId: activeCountry?._id,
                };
            } else {
                payload = {
                    product: currentProduct._id,
                    warehouse: currentWarehouse._id,
                    change: displayChange,
                    type: formData.type,
                    reason: formData.reason,
                    reference: `Manual Adjustment`,
                    countryId: activeCountry?._id,
                };
            }

            await api.post('/inventory/adjust', payload);
            setLoading(false);
            toast.success(isCorrection ? 'Stock corrected successfully' : 'Stock adjusted successfully');
            onSuccess();
            onClose();
        } catch (err) {
            setLoading(false);
            toast.error(err.response?.data?.errors?.[0]?.msg || err.response?.data?.message || 'Adjustment failed');
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <div className="modal-header">
                    <h2>Adjust Stock</h2>
                    <button onClick={onClose} className="btn-close" title="Close"><FiX /></button>
                </div>
                <div className="stock-context">
                    {!product && (
                        <div className="form-group">
                            <label>Product</label>
                            <select
                                value={formData.selectedProduct}
                                onChange={(e) => setFormData({ ...formData, selectedProduct: e.target.value })}
                                required
                                disabled={loadingData}
                            >
                                <option value="">Select a product...</option>
                                {products.map(p => (
                                    <option key={p._id} value={p._id}>{p.name} ({p.sku})</option>
                                ))}
                            </select>
                        </div>
                    )}
                    {!warehouse && (
                        <div className="form-group">
                            <label>Warehouse</label>
                            <select
                                value={formData.selectedWarehouse}
                                onChange={(e) => setFormData({ ...formData, selectedWarehouse: e.target.value })}
                                required
                                disabled={loadingData}
                            >
                                <option value="">Select a warehouse...</option>
                                {warehouses.map(w => (
                                    <option key={w._id} value={w._id}>{w.name}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    {currentProduct && currentWarehouse && (
                        <>
                            <p><strong>Product:</strong> {currentProduct.name} (SKU: {currentProduct.sku})</p>
                            <p><strong>Warehouse:</strong> {currentWarehouse.name}</p>
                            <p><strong>Carton Size:</strong> {cartonSize} pieces</p>
                        </>
                    )}
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Action Type</label>
                        <select
                            value={formData.type}
                            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                        >
                            <option value="IN">Stock In (+)</option>
                            <option value="OUT">Stock Out (-)</option>
                            <option value="ADJUSTMENT">Correction (Set To)</option>
                        </select>
                    </div>

                    {isCorrection && currentBalance !== null && (
                        <div style={{
                            background: '#F7FAFC',
                            border: '1px solid #E2E8F0',
                            borderRadius: '8px',
                            padding: '12px 16px',
                            marginBottom: '12px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <span style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 500 }}>Current Stock:</span>
                            <span style={{ fontSize: '1rem', fontWeight: 700, color: '#1E293B' }}>
                                {currentBalance} pieces
                                {cartonSize > 1 && (
                                    <span style={{ fontSize: '0.8rem', fontWeight: 400, color: '#64748B', marginLeft: '6px' }}>
                                        ({Math.floor(currentBalance / cartonSize)} ctns, {currentBalance % cartonSize} pcs)
                                    </span>
                                )}
                            </span>
                        </div>
                    )}

                    <div className="form-row">
                        <div className="form-group" style={{ flex: 1 }}>
                            <label>{isCorrection ? 'New Cartons' : 'Cartons'}</label>
                            <input
                                type="number"
                                min="0"
                                value={formData.cartons || ''}
                                onChange={(e) => setFormData({ ...formData, cartons: parseInt(e.target.value) || 0 })}
                                style={{ width: '100%' }}
                                placeholder={isCorrection ? 'New total cartons' : '0'}
                            />
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                            <label>{isCorrection ? 'New Pieces' : 'Pieces'}</label>
                            <input
                                type="number"
                                min="0"
                                value={formData.pieces || ''}
                                onChange={(e) => setFormData({ ...formData, pieces: parseInt(e.target.value) || 0 })}
                                style={{ width: '100%' }}
                                placeholder={isCorrection ? 'New total pieces' : '0'}
                            />
                        </div>
                    </div>

                    <div className="preview-box">
                        {isCorrection ? (
                            <>
                                <span>New Stock: </span>
                                <span style={{ fontWeight: 700, fontSize: '1.1rem', color: '#1E293B' }}>
                                    {totalInput} pieces
                                </span>
                                {currentBalance !== null && displayChange !== 0 && (
                                    <span style={{
                                        marginLeft: '12px',
                                        fontSize: '0.85rem',
                                        fontWeight: 600,
                                        color: displayChange > 0 ? '#10B981' : '#DC2626'
                                    }}>
                                        ({displayChange > 0 ? '+' : ''}{displayChange})
                                    </span>
                                )}
                            </>
                        ) : (
                            <>
                                <span>Total Change: </span>
                                <span
                                    className={`change-value ${isNegative ? 'negative' : 'positive'}`}
                                    style={{
                                        color: displayChange === 0 ? '#64748B' : (isNegative ? '#DC2626' : '#10B981'),
                                        fontWeight: 600,
                                        fontSize: '1.1rem'
                                    }}
                                >
                                    {displayChange > 0 ? '+' : ''}{displayChange} Pieces
                                </span>
                            </>
                        )}
                    </div>

                    <div className="form-group">
                        <label>Reason</label>
                        <textarea
                            value={formData.reason}
                            onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                            required
                            placeholder="Why are you making this adjustment?"
                        />
                    </div>

                    <div className="modal-actions">
                        <button type="button" onClick={onClose} className="btn btn-secondary" disabled={loading}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? <Spinner size={20} color="#fff" /> : 'Confirm Adjustment'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default StockAdjustmentModal;
