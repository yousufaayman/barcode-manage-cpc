import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { jobOrderApi, barcodeApi, JobOrder, BarcodeData } from '../services/api';
import VirtualizedTable from '../components/VirtualizedTable';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Link } from 'react-router-dom';

const ArchivePage: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const isAdmin = user?.role === 'admin';

  // Tabs -- job orders are the unit of archival; batches are a read-only view
  // of batches belonging to archived job orders (they have no archive state
  // of their own, see DB/DATA_ARCHIVING_DESIGN.md).
  const [activeTab, setActiveTab] = useState<'job-orders' | 'batches'>('job-orders');

  // Archived Job Orders state
  const [archivedJobOrders, setArchivedJobOrders] = useState<JobOrder[]>([]);
  const [loadingJobOrders, setLoadingJobOrders] = useState(false);
  const [jobOrdersTotal, setJobOrdersTotal] = useState(0);
  const [jobOrdersPage, setJobOrdersPage] = useState(1);
  const jobOrdersPerPage = 50;
  const [jobOrderFilters, setJobOrderFilters] = useState({
    job_order_number: '',
    model_name: '',
    client_name: ''
  });
  const [busyJobOrderId, setBusyJobOrderId] = useState<number | null>(null);

  // Archived Batches state (read-only)
  const [barcodes, setBarcodes] = useState<BarcodeData[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [batchesPage, setBatchesPage] = useState(1);
  const [totalBarcodes, setTotalBarcodes] = useState(0);
  const [batchFilters, setBatchFilters] = useState({
    barcode: '',
    job_order_number: '',
  });
  const itemsPerPage = 50;

  // Fetch archived job orders
  const fetchArchivedJobOrders = useCallback(async () => {
    try {
      setLoadingJobOrders(true);
      const skip = (jobOrdersPage - 1) * jobOrdersPerPage;
      const response = await jobOrderApi.getAllArchived({
        skip,
        limit: jobOrdersPerPage,
        ...Object.fromEntries(Object.entries(jobOrderFilters).filter(([, v]) => v !== ''))
      });
      setArchivedJobOrders(response.items);
      setJobOrdersTotal(response.total);
    } catch (error) {
      console.error('Error fetching archived job orders:', error);
    } finally {
      setLoadingJobOrders(false);
    }
  }, [jobOrdersPage, jobOrderFilters]);

  useEffect(() => {
    fetchArchivedJobOrders();
  }, [fetchArchivedJobOrders]);

  // Fetch archived batches (batches whose job order is archived)
  const fetchArchivedBatches = useCallback(async () => {
    try {
      setLoadingBatches(true);
      const skip = (batchesPage - 1) * itemsPerPage;
      const response = await barcodeApi.getBarcodes({
        skip,
        limit: itemsPerPage,
        archived: true,
        ...Object.fromEntries(Object.entries(batchFilters).filter(([, v]) => v !== ''))
      });
      setBarcodes(response.items);
      setTotalBarcodes(response.total);
    } catch (error) {
      console.error('Error fetching archived batches:', error);
    } finally {
      setLoadingBatches(false);
    }
  }, [batchesPage, batchFilters]);

  useEffect(() => {
    if (activeTab === 'batches') {
      fetchArchivedBatches();
    }
  }, [activeTab, fetchArchivedBatches]);

  const handleRestoreJobOrder = useCallback(async (jobOrderId: number) => {
    if (!window.confirm('Restore this job order? It will reappear in active views.')) return;
    try {
      setBusyJobOrderId(jobOrderId);
      await jobOrderApi.restore(jobOrderId);
      setArchivedJobOrders(prev => prev.filter(jo => jo.job_order_id !== jobOrderId));
      setJobOrdersTotal(prev => Math.max(0, prev - 1));
    } catch (error: any) {
      console.error('Error restoring job order:', error);
      alert(error.response?.data?.detail || error.message || 'Failed to restore job order');
    } finally {
      setBusyJobOrderId(null);
    }
  }, []);

  // Batches restore through their job order (they have no archive state of their own)
  const handleRestoreFromBatch = useCallback(async (jobOrderId: number, jobOrderNumber?: string) => {
    const label = jobOrderNumber || `#${jobOrderId}`;
    if (!window.confirm(`Restore job order ${label}? All of its batches will be restored with it.`)) return;
    try {
      setBusyJobOrderId(jobOrderId);
      await jobOrderApi.restore(jobOrderId);
      setBarcodes(prev => prev.filter(b => b.job_order_id !== jobOrderId));
      setTotalBarcodes(prev => Math.max(0, prev - barcodes.filter(b => b.job_order_id === jobOrderId).length));
      setArchivedJobOrders(prev => prev.filter(jo => jo.job_order_id !== jobOrderId));
      setJobOrdersTotal(prev => Math.max(0, prev - 1));
    } catch (error: any) {
      console.error('Error restoring job order:', error);
      alert(error.response?.data?.detail || error.message || 'Failed to restore job order');
    } finally {
      setBusyJobOrderId(null);
    }
  }, [barcodes]);

  const handlePurgeJobOrder = useCallback(async (jobOrderId: number, jobOrderNumber: string) => {
    const confirmText = window.prompt(
      `This permanently deletes job order ${jobOrderNumber} and everything that depends on it ` +
      `(items, batches, scan events, cut details, phase history). There is NO UNDO.\n\n` +
      `Type the job order number to confirm: ${jobOrderNumber}`
    );
    if (confirmText !== jobOrderNumber) {
      if (confirmText !== null) alert('Job order number did not match -- purge cancelled.');
      return;
    }
    try {
      setBusyJobOrderId(jobOrderId);
      const result = await jobOrderApi.purge(jobOrderId);
      setArchivedJobOrders(prev => prev.filter(jo => jo.job_order_id !== jobOrderId));
      setJobOrdersTotal(prev => Math.max(0, prev - 1));
      alert(`Permanently deleted job order ${jobOrderNumber} (${result.deleted_batches} batches, ${result.deleted_cut_details} cut details).`);
    } catch (error: any) {
      console.error('Error purging job order:', error);
      alert(error.response?.data?.detail || error.message || 'Failed to purge job order');
    } finally {
      setBusyJobOrderId(null);
    }
  }, []);

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setBatchFilters(prev => ({ ...prev, [name]: value }));
    setBatchesPage(1);
  };

  const totalJobOrderPages = Math.ceil(jobOrdersTotal / jobOrdersPerPage);
  const totalBatchPages = Math.ceil(totalBarcodes / itemsPerPage);

  // Columns: Archived Job Orders
  const jobOrderColumns = useMemo(() => {
    const columns: any[] = [
      { key: 'job_order_number', header: t('barcode.jobOrderNumber'), width: 160 },
      { key: 'client_name', header: t('bulkBarcode.client'), width: 140, render: (item: JobOrder) => item.client_name || '—' },
      { key: 'model_name', header: t('bulkBarcode.model'), width: 160, render: (item: JobOrder) => item.model_name || '—' },
      {
        key: 'archived_at',
        header: 'Archived At',
        width: 170,
        render: (item: JobOrder) => item.archived_at ? new Date(item.archived_at).toLocaleString() : '—'
      },
      {
        key: 'actions',
        header: t('common.actions'),
        width: 220,
        render: (item: JobOrder) => (
          <div className="flex space-x-2">
            <Link
              to={`/job-orders/${item.job_order_id}`}
              className="px-2 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
              title="View"
            >
              View
            </Link>
            <button
              onClick={() => handleRestoreJobOrder(item.job_order_id)}
              disabled={busyJobOrderId === item.job_order_id}
              className="px-2 py-1 text-sm bg-green text-white rounded hover:opacity-90 transition-colors disabled:opacity-50"
              title="Restore this job order"
            >
              Restore
            </button>
            {isAdmin && (
              <button
                onClick={() => handlePurgeJobOrder(item.job_order_id, item.job_order_number)}
                disabled={busyJobOrderId === item.job_order_id}
                className="px-2 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50"
                title="Permanently delete (no undo)"
              >
                Purge
              </button>
            )}
          </div>
        )
      }
    ];
    return columns;
  }, [t, isAdmin, busyJobOrderId, handleRestoreJobOrder, handlePurgeJobOrder]);

  // Columns: Archived Batches (read-only)
  const batchColumns = useMemo(() => {
    return [
      { key: 'barcode', header: t('barcode.barcode'), width: 150 },
      { key: 'job_order_number', header: t('barcode.jobOrderNumber'), width: 140 },
      { key: 'client_name', header: t('bulkBarcode.client'), width: 120 },
      { key: 'model_name', header: t('bulkBarcode.model'), width: 120 },
      { key: 'size_value', header: t('bulkBarcode.size'), width: 100 },
      { key: 'color_name', header: t('bulkBarcode.color'), width: 100 },
      { key: 'quantity', header: t('barcode.quantity'), width: 100 },
      { key: 'status', header: t('common.status'), width: 120 },
      {
        key: 'archived_at',
        header: 'Job Order Archived At',
        width: 180,
        render: (item: BarcodeData) => item.archived_at ? new Date(item.archived_at).toLocaleString() : '—'
      },
      {
        key: 'actions',
        header: t('common.actions'),
        width: 170,
        render: (item: BarcodeData) => (
          <button
            onClick={() => handleRestoreFromBatch(item.job_order_id, item.job_order_number)}
            disabled={busyJobOrderId === item.job_order_id}
            className="px-2 py-1 text-sm bg-green text-white rounded hover:opacity-90 transition-colors disabled:opacity-50"
            title="Restore this batch's job order (restores all its batches)"
          >
            Restore Job Order
          </button>
        )
      },
    ];
  }, [t, busyJobOrderId, handleRestoreFromBatch]);

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2 text-gray-800">{t('navigation.archive')}</h1>
        <p className="text-gray-600">
          Archived job orders are hidden from active views. Restoring brings a job order (and its items/batches) back instantly; purging permanently deletes it.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="mb-4">
            <TabsTrigger value="job-orders">{t('barcodeManagement.archive.tabs.jobOrders')}</TabsTrigger>
            <TabsTrigger value="batches">{t('barcodeManagement.archive.tabs.batches')}</TabsTrigger>
          </TabsList>

          {/* Archived Job Orders Tab */}
          <TabsContent value="job-orders">
            <div className="space-y-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-lg font-semibold mb-3 text-gray-800">{t('barcodeManagement.archive.filters')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="form-group">
                    <label className="text-sm font-medium text-gray-700">{t('barcode.jobOrderNumber')}</label>
                    <input
                      type="text"
                      value={jobOrderFilters.job_order_number}
                      onChange={(e) => { setJobOrderFilters(prev => ({ ...prev, job_order_number: e.target.value })); setJobOrdersPage(1); }}
                      className="input-field"
                    />
                  </div>
                  <div className="form-group">
                    <label className="text-sm font-medium text-gray-700">{t('bulkBarcode.model')}</label>
                    <input
                      type="text"
                      value={jobOrderFilters.model_name}
                      onChange={(e) => { setJobOrderFilters(prev => ({ ...prev, model_name: e.target.value })); setJobOrdersPage(1); }}
                      className="input-field"
                    />
                  </div>
                  <div className="form-group">
                    <label className="text-sm font-medium text-gray-700">{t('bulkBarcode.client')}</label>
                    <input
                      type="text"
                      value={jobOrderFilters.client_name}
                      onChange={(e) => { setJobOrderFilters(prev => ({ ...prev, client_name: e.target.value })); setJobOrdersPage(1); }}
                      className="input-field"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg border">
                {loadingJobOrders ? (
                  <div className="text-center py-10">
                    <div className="w-12 h-12 border-4 border-green border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                    <p className="text-gray-600">{t('barcodeManagement.archive.loadingArchivedJobOrders')}</p>
                  </div>
                ) : (
                  <>
                    <div className="p-4">
                      {archivedJobOrders.length === 0 ? (
                        <div className="text-center py-8 text-gray-600">{t('barcodeManagement.archive.noArchivedJobOrdersFound')}</div>
                      ) : (
                        <VirtualizedTable
                          columns={jobOrderColumns}
                          data={archivedJobOrders}
                          height={600}
                          rowHeight={48}
                          showAllColumns={true}
                        />
                      )}
                    </div>

                    {totalJobOrderPages > 1 && (
                      <div className="border-t bg-gray-50 px-4 py-3">
                        <div className="flex justify-center space-x-2">
                          <button
                            onClick={() => setJobOrdersPage(p => Math.max(1, p - 1))}
                            disabled={jobOrdersPage === 1}
                            className="px-3 py-1 rounded border disabled:opacity-50 hover:bg-gray-100"
                          >
                            {t('common.previous')}
                          </button>
                          <div className="px-3 py-1 rounded border bg-green text-white">{jobOrdersPage}</div>
                          <button
                            onClick={() => setJobOrdersPage(p => (p < totalJobOrderPages ? p + 1 : p))}
                            disabled={jobOrdersPage >= totalJobOrderPages}
                            className="px-3 py-1 rounded border disabled:opacity-50 hover:bg-gray-100"
                          >
                            {t('common.next')}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Archived Batches Tab (read-only) */}
          <TabsContent value="batches">
            <div className="space-y-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-lg font-semibold text-gray-800">{t('barcodeManagement.filters')}</h3>
                  <button
                    onClick={() => { setBatchFilters({ barcode: '', job_order_number: '' }); setBatchesPage(1); }}
                    className="px-3 py-1 text-sm text-purple-700 border-2 border-purple-400 bg-purple-50 rounded-md hover:bg-purple-100 transition-all"
                  >
                    {t('barcodeManagement.clearFilters')}
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="form-group">
                    <label className="text-sm font-medium text-gray-700">{t('barcode.barcode')}</label>
                    <input
                      type="text"
                      name="barcode"
                      value={batchFilters.barcode}
                      onChange={handleFilterChange}
                      className="input-field"
                    />
                  </div>
                  <div className="form-group">
                    <label className="text-sm font-medium text-gray-700">{t('barcode.jobOrderNumber')}</label>
                    <input
                      type="text"
                      name="job_order_number"
                      value={batchFilters.job_order_number}
                      onChange={handleFilterChange}
                      className="input-field"
                    />
                  </div>
                </div>
              </div>

              <p className="text-sm text-gray-500">
                Batches belong to their job order and are archived/restored together with it. Restoring from a batch restores its whole job order.
              </p>

              {loadingBatches ? (
                <div className="text-center py-10">
                  <div className="w-12 h-12 border-4 border-green border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                  <p className="text-gray-600">{t('barcodeManagement.archive.loadingArchivedBarcodes')}</p>
                </div>
              ) : (
                <>
                  <div className="table-container mb-4 w-full">
                    <div className="overflow-x-auto w-full">
                      {barcodes.length === 0 ? (
                        <div className="text-center py-4">{t('barcodeManagement.archive.noArchivedBarcodesFound')}</div>
                      ) : (
                        <VirtualizedTable
                          columns={batchColumns}
                          data={barcodes}
                          height={600}
                          rowHeight={48}
                          showAllColumns={true}
                        />
                      )}
                    </div>
                  </div>

                  {totalBatchPages > 1 && (
                    <div className="flex justify-center mt-4">
                      <nav className="flex items-center space-x-2">
                        <button
                          onClick={() => setBatchesPage(p => Math.max(1, p - 1))}
                          disabled={batchesPage === 1}
                          className="px-3 py-1 rounded border disabled:opacity-50"
                        >
                          {t('common.previous')}
                        </button>
                        <div className="px-3 py-1 rounded border bg-green text-white">{batchesPage}</div>
                        <button
                          onClick={() => setBatchesPage(p => (p < totalBatchPages ? p + 1 : p))}
                          disabled={batchesPage >= totalBatchPages}
                          className="px-3 py-1 rounded border disabled:opacity-50"
                        >
                          {t('common.next')}
                        </button>
                      </nav>
                    </div>
                  )}
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <div className="mt-6 text-center">
        <Link
          to="/barcode-management"
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-all duration-200 ease-in-out"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          {t('barcodeManagement.archive.backToBarcodeManagement')}
        </Link>
      </div>
    </Layout>
  );
};

export default React.memo(ArchivePage);
