import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, Legend, LineChart, Line } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { statisticsApi, ProductionStatisticsResponse, BrandStatisticsResponse, ModelStatisticsResponse, jobOrderApi, barcodeApi, BarcodeData, JobOrderItemSummary } from '../services/api';
import { useTranslation } from 'react-i18next';
import { TrendingUp, TrendingDown, Package, Users, Clock, AlertTriangle, CheckCircle, Activity, Search } from 'lucide-react';
import ProductionPhasesOverview from './AdvancedStatisticsProductionPhasesOverview';
import JobOrderStatusSearch from './AdvancedStatisticsJobOrderStatusSearch';

const AdvancedStatisticsPage: React.FC = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<ProductionStatisticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBrand, setSelectedBrand] = useState<BrandStatisticsResponse | null>(null);
  const [selectedModel, setSelectedModel] = useState<ModelStatisticsResponse | null>(null);
  const [jobOrderSearch, setJobOrderSearch] = useState<string>('');
  const [jobOrderItems, setJobOrderItems] = useState<JobOrderItemSummary[]>([]);
  const [jobOrderBatches, setJobOrderBatches] = useState<{[itemId: number]: BarcodeData[]}>({});
  const [jobOrderLoading, setJobOrderLoading] = useState(false);
  const [showDetailedBreakdown, setShowDetailedBreakdown] = useState(false);
  const [selectedItemForModal, setSelectedItemForModal] = useState<JobOrderItemSummary | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [phasesData, setPhasesData] = useState<{[phaseName: string]: {
    model_color_groups: {[modelColorKey: string]: {
      model_name: string;
      color_name: string;
      total_quantity: number;
      expected_quantity: number;
      batch_count: number;
      time_in_phase: string;
      sizes: Array<{
        size_value: string;
        quantity: number;
        expected_quantity: number;
        batch_count: number;
        time_in_phase: string;
      }>;
      second_degree_sizes: Array<{
        size_value: string;
        quantity: number;
        expected_quantity: number;
        batch_count: number;
        time_in_phase: string;
      }>;
    }};
    daily_throughput: {scanned_in_not_out: number; completed: number; efficiency_ratio: number};
  }}>({});
  const [phasesLoading, setPhasesLoading] = useState(false);
  const [phasesModelSearch, setPhasesModelSearch] = useState('');
  const [phasesColorSearch, setPhasesColorSearch] = useState('');
  const [jobOrderOptions, setJobOrderOptions] = useState<{ job_order_number: string; model_name: string | null }[]>([]);

  useEffect(() => {
    loadProductionStatistics();
    loadPhasesData();
    jobOrderApi.getAllSimple().then(setJobOrderOptions);
  }, []);

  const loadProductionStatistics = async () => {
    try {
      setLoading(true);
      setError(null);
      const stats = await statisticsApi.getProductionStatistics();
      setData(stats);
    } catch (err: any) {
      setError(err.message || 'Failed to load statistics');
    } finally {
      setLoading(false);
    }
  };

  const loadPhasesData = async () => {
    try {
      setPhasesLoading(true);
      const data = await barcodeApi.getCurrentBatchesByPhase();
      setPhasesData(data);
    } catch (err: any) {
      console.error('Failed to load phases data:', err);
    } finally {
      setPhasesLoading(false);
    }
  };

  const loadBrandStatistics = async (brandId: number) => {
    try {
      const brandStats = await statisticsApi.getBrandStatistics(brandId);
      setSelectedBrand(brandStats);
      setSelectedModel(null);
    } catch (err: any) {
      console.error('Failed to load brand statistics:', err);
    }
  };

  const loadModelStatistics = async (modelId: number) => {
    try {
      const modelStats = await statisticsApi.getModelStatistics(modelId);
      setSelectedModel(modelStats);
      setSelectedBrand(null);
    } catch (err: any) {
      console.error('Failed to load model statistics:', err);
    }
  };

  const searchJobOrder = async () => {
    if (!jobOrderSearch.trim()) return;
    
    try {
      setJobOrderLoading(true);
      const jobOrderNumber = jobOrderSearch.trim();
      
      // Get job order by number
      const jobOrder = await jobOrderApi.getByNumber(jobOrderNumber);
      
      // Get item summaries for this job order
      const itemSummaries = await jobOrderApi.getItemSummaries({
        job_order_id: jobOrder.job_order_id
      });
      
      setJobOrderItems(itemSummaries.items);
      
      // Get all batches for the job order and then filter by item
      const allBatches = await barcodeApi.getBarcodes({
        job_order_id: jobOrder.job_order_id
      });
      
      const batchesData: {[itemId: number]: BarcodeData[]} = {};
      
      for (const item of itemSummaries.items) {
        // Filter batches for this specific item (color + size combination)
        const itemBatches = allBatches.items.filter(batch => 
          batch.color_id === item.color_id && batch.size_id === item.size_id
        );
        batchesData[item.item_id] = itemBatches;
      }
      
      setJobOrderBatches(batchesData);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load job order items');
      setJobOrderItems([]);
      setJobOrderBatches({});
    } finally {
      setJobOrderLoading(false);
    }
  };

  // Filter phases data by model and color search
  const getFilteredPhasesData = () => {
    if (!phasesModelSearch.trim() && !phasesColorSearch.trim()) {
      return phasesData;
    }

    const filteredData: typeof phasesData = {};
    
    Object.entries(phasesData).forEach(([phaseName, phaseData]) => {
      const filteredGroups: typeof phaseData.model_color_groups = {};
      
      Object.entries(phaseData.model_color_groups).forEach(([key, group]) => {
        const modelMatch = !phasesModelSearch.trim() || 
          group.model_name.toLowerCase().includes(phasesModelSearch.toLowerCase());
        const colorMatch = !phasesColorSearch.trim() || 
          group.color_name.toLowerCase().includes(phasesColorSearch.toLowerCase());
        
        if (modelMatch && colorMatch) {
          filteredGroups[key] = group;
        }
      });
      
      if (Object.keys(filteredGroups).length > 0) {
        filteredData[phaseName] = {
          model_color_groups: filteredGroups,
          daily_throughput: phaseData.daily_throughput
        };
      }
    });
    
    return filteredData;
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading production statistics...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="p-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center">
              <AlertTriangle className="h-5 w-5 text-red-400 mr-2" />
              <h3 className="text-red-800 font-medium">Error Loading Statistics</h3>
            </div>
            <p className="text-red-700 mt-2">{error}</p>
            <button
              onClick={loadProductionStatistics}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  if (!data) {
    return (
      <Layout>
        <div className="p-6">
          <div className="text-center py-8">
            <Package className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Data Available</h3>
            <p className="text-gray-600">No production statistics found.</p>
          </div>
        </div>
      </Layout>
    );
  }

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Production Statistics</h1>
            <p className="text-gray-600 mt-2">Real-time production monitoring and analytics</p>
                  </div>
          <button
            onClick={() => {
              loadProductionStatistics();
              loadPhasesData();
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Activity className="h-4 w-4" />
            Refresh
          </button>
              </div>

        {/* Overall Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                  <p className="text-sm font-medium text-gray-600">Total Batches</p>
                  <p className="text-3xl font-bold text-gray-900">{data.overall_stats.total_batches}</p>
                </div>
                <Package className="h-8 w-8 text-blue-600" />
                </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Pending</p>
                  <p className="text-3xl font-bold text-yellow-600">{data.overall_stats.total_pending}</p>
                </div>
                <Clock className="h-8 w-8 text-yellow-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">In Progress</p>
                  <p className="text-3xl font-bold text-blue-600">{data.overall_stats.total_in_progress}</p>
                    </div>
                <TrendingUp className="h-8 w-8 text-blue-600" />
                    </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Completed</p>
                  <p className="text-3xl font-bold text-green-600">{data.overall_stats.total_completed}</p>
                    </div>
                <CheckCircle className="h-8 w-8 text-green-600" />
                    </div>
            </CardContent>
          </Card>
        </div>

        {/* Completion Rate and Second Degree */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Completion Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center">
                <div className="text-4xl font-bold text-green-600 mb-2">
                  {data.overall_stats.completion_rate}%
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-green-600 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${data.overall_stats.completion_rate}%` }}
                  ></div>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  {data.overall_stats.total_completed} of {data.overall_stats.total_batches} batches completed
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Second Degree Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Second Degree Batches:</span>
                  <span className="font-semibold">{data.second_degree_stats.second_degree_batches}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Second Degree Quantity:</span>
                  <span className="font-semibold">{data.second_degree_stats.second_degree_quantity}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Percentage:</span>
                  <span className="font-semibold text-orange-600">
                    {data.second_degree_stats.second_degree_percentage}%
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* WIP by Phase Chart */}
          <Card>
            <CardHeader>
            <CardTitle>Work in Progress by Phase</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.wip_by_phase}>
                  <XAxis dataKey="phase_name" />
                  <YAxis />
                  <Tooltip />
                <Legend />
                <Bar dataKey="pending" fill="#FCD34D" name="Pending" />
                <Bar dataKey="in_progress" fill="#3B82F6" name="In Progress" />
                <Bar dataKey="completed" fill="#10B981" name="Completed" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

        {/* Production Phases Overview */}
        <ProductionPhasesOverview
          phasesData={phasesData}
          phasesLoading={phasesLoading}
          phasesModelSearch={phasesModelSearch}
          setPhasesModelSearch={setPhasesModelSearch}
          phasesColorSearch={phasesColorSearch}
          setPhasesColorSearch={setPhasesColorSearch}
          loadPhasesData={loadPhasesData}
          getFilteredPhasesData={getFilteredPhasesData}
        />
        
        {/* Job Order Search */}
        <JobOrderStatusSearch
          jobOrderSearch={jobOrderSearch}
          setJobOrderSearch={setJobOrderSearch}
          searchJobOrder={searchJobOrder}
          jobOrderLoading={jobOrderLoading}
          jobOrderItems={jobOrderItems}
          jobOrderBatches={jobOrderBatches}
          setSelectedItemForModal={setSelectedItemForModal}
          setIsModalOpen={setIsModalOpen}
          jobOrderOptions={jobOrderOptions}
        />

        

        {selectedBrand && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{selectedBrand.brand_info.brand_name} Statistics</span>
                <button
                  onClick={() => setSelectedBrand(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {selectedBrand.phases
                  .sort((a, b) => a.phase_id - b.phase_id)
                  .map((phase) => (
                  <div key={phase.phase_id} className="p-4 bg-gray-50 rounded-lg">
                    <h4 className="font-medium text-gray-900 mb-2">{phase.phase_name}</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Pending:</span>
                        <span className="font-semibold text-yellow-600">{phase.pending}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">In Progress:</span>
                        <span className="font-semibold text-blue-600">{phase.in_progress}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Completed:</span>
                        <span className="font-semibold text-green-600">{phase.completed}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {selectedModel && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{selectedModel.model_info.model_name} Statistics</span>
                <button
                  onClick={() => setSelectedModel(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {selectedModel.phases
                  .sort((a, b) => a.phase_id - b.phase_id)
                  .map((phase) => (
                  <div key={phase.phase_id} className="p-4 bg-gray-50 rounded-lg">
                    <h4 className="font-medium text-gray-900 mb-2">{phase.phase_name}</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Pending:</span>
                        <span className="font-semibold text-yellow-600">{phase.pending}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">In Progress:</span>
                        <span className="font-semibold text-blue-600">{phase.in_progress}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Completed:</span>
                        <span className="font-semibold text-green-600">{phase.completed}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Job Order Item Details Modal */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {selectedItemForModal ? `${selectedItemForModal.color_name} - Detailed Breakdown` : 'Item Details'}
              </DialogTitle>
            </DialogHeader>
            
            {selectedItemForModal && (() => {
              // Get all items of the same color for detailed breakdown
              const colorItems = jobOrderItems.filter(item => item.color_name === selectedItemForModal.color_name);
              
              return (
                <div className="space-y-6">
                  {/* Summary for the color */}
                  <div className="bg-blue-50 rounded-lg p-4">
                    <h3 className="font-semibold text-blue-900 mb-2">Color Summary: {selectedItemForModal.color_name}</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-gray-900">
                          {colorItems.reduce((sum, item) => sum + item.expected_quantity, 0)}
                        </div>
                        <div className="text-sm text-gray-600">Total Expected</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600">
                          {colorItems.reduce((sum, item) => sum + item.cut_quantity, 0)}
                        </div>
                        <div className="text-sm text-gray-600">Total Cut</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-orange-600">
                          {colorItems.reduce((sum, item) => sum + item.working_quantity, 0)}
                        </div>
                        <div className="text-sm text-gray-600">Total Working</div>
                      </div>
                    </div>
                  </div>

                  {/* Individual items breakdown */}
                  <div className="space-y-4">
                    <h3 className="font-semibold text-gray-900">Size Breakdown</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {colorItems.map((item) => {
                        const batches = jobOrderBatches[item.item_id] || [];
                        const phaseBreakdown = batches.reduce((acc, batch) => {
                          const phaseKey = `phase_${batch.current_phase}`;
                          if (!acc[phaseKey]) acc[phaseKey] = { pending: 0, in_progress: 0, completed: 0 };
                          acc[phaseKey][batch.status.toLowerCase().replace(' ', '_')] += batch.quantity;
                          return acc;
                        }, {} as any);

                        return (
                          <Card key={item.item_id} className="p-4">
                            <CardHeader className="pb-3">
                              <CardTitle className="text-lg">Size: {item.size_value || 'N/A'}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              <div className="grid grid-cols-3 gap-4">
                                <div className="text-center">
                                  <div className="text-xl font-bold text-gray-900">{item.expected_quantity}</div>
                                  <div className="text-sm text-gray-600">Expected</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-xl font-bold text-blue-600">{item.cut_quantity}</div>
                                  <div className="text-sm text-gray-600">Cut</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-xl font-bold text-orange-600">{item.working_quantity}</div>
                                  <div className="text-sm text-gray-600">Working</div>
                                </div>
                              </div>
                              
                                                             <div className="space-y-3">
                                 {Object.entries(phaseBreakdown)
                                   .sort(([a], [b]) => {
                                     const phaseNumA = parseInt(a.replace('phase_', ''));
                                     const phaseNumB = parseInt(b.replace('phase_', ''));
                                     return phaseNumA - phaseNumB;
                                   })
                                   .map(([phaseKey, statusCounts]: [string, any]) => {
                                   const phaseNum = phaseKey.replace('phase_', '');
                                   const phaseName = batches.find(b => b.current_phase === parseInt(phaseNum))?.phase_name || `Phase ${phaseNum}`;
                                   const total = statusCounts.pending + statusCounts.in_progress + statusCounts.completed;
                                   
                                   return (
                                     <div key={phaseKey} className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg p-3 border border-gray-200 shadow-sm">
                                       <div className="flex items-center justify-between mb-2">
                                         <div className="font-medium text-gray-800 text-sm">{phaseName}</div>
                                         <div className="text-xs text-gray-500">Total: {total}</div>
                                       </div>
                                       
                                       <div className="space-y-2">
                                         {statusCounts.pending > 0 && (
                                           <div className="flex items-center gap-2">
                                             <div className="w-3 h-3 bg-yellow-400 rounded-full"></div>
                                             <div className="flex-1 bg-gray-200 rounded-full h-2">
                                               <div 
                                                 className="bg-yellow-400 h-2 rounded-full transition-all duration-300"
                                                 style={{ width: `${(statusCounts.pending / total) * 100}%` }}
                                               ></div>
                                             </div>
                                             <span className="text-xs font-medium text-yellow-700 min-w-[60px]">
                                               Pending: {statusCounts.pending}
                                             </span>
                                           </div>
                                         )}
                                         
                                         {statusCounts.in_progress > 0 && (
                                           <div className="flex items-center gap-2">
                                             <div className="w-3 h-3 bg-blue-400 rounded-full"></div>
                                             <div className="flex-1 bg-gray-200 rounded-full h-2">
                                               <div 
                                                 className="bg-blue-400 h-2 rounded-full transition-all duration-300"
                                                 style={{ width: `${(statusCounts.in_progress / total) * 100}%` }}
                                               ></div>
                                             </div>
                                             <span className="text-xs font-medium text-blue-700 min-w-[60px]">
                                               In Progress: {statusCounts.in_progress}
                                             </span>
                                           </div>
                                         )}
                                         
                                         {statusCounts.completed > 0 && (
                                           <div className="flex items-center gap-2">
                                             <div className="w-3 h-3 bg-green-400 rounded-full"></div>
                                             <div className="flex-1 bg-gray-200 rounded-full h-2">
                                               <div 
                                                 className="bg-green-400 h-2 rounded-full transition-all duration-300"
                                                 style={{ width: `${(statusCounts.completed / total) * 100}%` }}
                                               ></div>
                                             </div>
                                             <span className="text-xs font-medium text-green-700 min-w-[60px]">
                                               Completed: {statusCounts.completed}
                                             </span>
                                           </div>
                                         )}
                                       </div>
                                     </div>
                                   );
                                 })}
                                 {batches.length === 0 && (
                                   <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg p-3 border border-gray-200 shadow-sm">
                                     <div className="flex items-center gap-2">
                                       <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
                                       <span className="text-gray-500 text-sm">No batches</span>
                                     </div>
                                   </div>
                                 )}
                               </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
        </div>
              );
            })()}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default AdvancedStatisticsPage; 