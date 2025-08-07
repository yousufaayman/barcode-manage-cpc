import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { Search } from 'lucide-react';
import { JobOrderItemSummary, BarcodeData } from '../services/api';
import SearchableDropdown from '../components/SearchableDropdown';

export interface JobOrderStatusSearchProps {
  jobOrderSearch: string;
  setJobOrderSearch: (v: string) => void;
  searchJobOrder: () => void;
  jobOrderLoading: boolean;
  jobOrderItems: JobOrderItemSummary[];
  jobOrderBatches: { [itemId: number]: BarcodeData[] };
  setSelectedItemForModal: (item: JobOrderItemSummary) => void;
  setIsModalOpen: (open: boolean) => void;
  jobOrderOptions: { job_order_number: string; model_name: string | null }[];
}

const JobOrderStatusSearch: React.FC<JobOrderStatusSearchProps> = ({
  jobOrderSearch,
  setJobOrderSearch,
  searchJobOrder,
  jobOrderLoading,
  jobOrderItems,
  jobOrderBatches,
  setSelectedItemForModal,
  setIsModalOpen,
  jobOrderOptions,
}) => {
  // Memoize dropdown options as strings for display, but allow search by both fields
  const dropdownOptions = jobOrderOptions.map(o =>
    o.model_name && o.model_name !== o.job_order_number
      ? `${o.job_order_number} (${o.model_name})`
      : o.job_order_number
  );

  // Custom filter: allow search by job_order_number or model_name
  const filterOption = (option: string, search: string) => {
    const lower = search.toLowerCase();
    return option.toLowerCase().includes(lower);
  };

  // Find the selected option string for the current value
  const selectedOption = (() => {
    const found = jobOrderOptions.find(
      o => o.job_order_number === jobOrderSearch
    );
    return found && found.model_name && found.model_name !== found.job_order_number
      ? `${found.job_order_number} (${found.model_name})`
      : jobOrderSearch;
  })();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          Job Order Status Search
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row gap-4 mb-6 items-center">
          <div className="flex-1">
            <SearchableDropdown
              value={selectedOption}
              onChange={val => {
                // Extract job_order_number from the selected string
                const match = /^([^(\s]+)\s*\(/.exec(val);
                if (match) {
                  setJobOrderSearch(match[1]);
                } else {
                  setJobOrderSearch(val);
                }
              }}
              options={dropdownOptions}
              placeholder="Enter or select Job Order Number or Model Name"
              label=""
              disabled={jobOrderLoading}
              className="h-10"
            />
          </div>
          <Button
            onClick={searchJobOrder}
            disabled={jobOrderLoading || !jobOrderSearch.trim()}
            className="flex items-center gap-2 h-10"
          >
            {jobOrderLoading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              <Search className="h-4 w-4" />
            )}
            Search
          </Button>
        </div>
        {jobOrderItems.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Job Order Items Status</h3>
            </div>
            {jobOrderItems.length > 0 && (
              <div className="mb-6">
                <Card className="p-4">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Overall Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-gray-900">{jobOrderItems.reduce((sum, item) => sum + item.expected_quantity, 0)}</div>
                        <div className="text-sm text-gray-600">Expected Qty</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600">{jobOrderItems.reduce((sum, item) => sum + item.cut_quantity, 0)}</div>
                        <div className="text-sm text-gray-600">Cut Qty</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-orange-600">{jobOrderItems.reduce((sum, item) => sum + item.working_quantity, 0)}</div>
                        <div className="text-sm text-gray-600">Working Qty</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(() => {
                // Group items by color
                const colorGroups = jobOrderItems.reduce((acc, item) => {
                  if (!acc[item.color_name]) {
                    acc[item.color_name] = [];
                  }
                  acc[item.color_name].push(item);
                  return acc;
                }, {} as {[color: string]: JobOrderItemSummary[]});
                return Object.entries(colorGroups).map(([colorName, items]) => {
                  // Aggregate quantities for this color
                  const totalExpected = items.reduce((sum, item) => sum + item.expected_quantity, 0);
                  const totalCut = items.reduce((sum, item) => sum + item.cut_quantity, 0);
                  const totalWorking = items.reduce((sum, item) => sum + item.working_quantity, 0);
                  // Aggregate batches for this color
                  const allBatches = items.flatMap(item => jobOrderBatches[item.item_id] || []);
                  const phaseBreakdown = allBatches.reduce((acc, batch) => {
                    const phaseKey = `phase_${batch.current_phase}`;
                    if (!acc[phaseKey]) acc[phaseKey] = { pending: 0, in_progress: 0, completed: 0 };
                    acc[phaseKey][batch.status.toLowerCase().replace(' ', '_')] += batch.quantity;
                    return acc;
                  }, {} as any);
                  return (
                    <Card key={colorName} className="p-4">
                      <CardHeader className="pb-3">
                        <div>
                          <CardTitle className="text-lg">{colorName}</CardTitle>
                          <div className="text-sm text-gray-600">{items.length} size{items.length > 1 ? 's' : ''}</div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-3 gap-4">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-gray-900">{totalExpected}</div>
                            <div className="text-sm text-gray-600">Expected Qty</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-blue-600">{totalCut}</div>
                            <div className="text-sm text-gray-600">Cut Qty</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-orange-600">{totalWorking}</div>
                            <div className="text-sm text-gray-600">Working Qty</div>
                          </div>
                        </div>
                        <div className="flex justify-center pt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedItemForModal(items[0]);
                              setIsModalOpen(true);
                            }}
                            className="flex items-center gap-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          >
                            <Search className="h-4 w-4" />
                            View Details
                          </Button>
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
                              const phaseName = allBatches.find(b => b.current_phase === parseInt(phaseNum))?.phase_name || `Phase ${phaseNum}`;
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
                          {allBatches.length === 0 && (
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
                });
              })()}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default JobOrderStatusSearch;