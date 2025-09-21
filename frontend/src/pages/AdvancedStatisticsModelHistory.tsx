import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { statisticsApi, barcodeApi, ModelHistoryResponse, ModelHistoryEntry, ModelHistoryGroup, ModelHistorySizeData, JobOrderItemBatchDetails } from '../services/api';
import { useTranslation } from 'react-i18next';
import { Search, Clock, TrendingUp, Package, Calendar, Eye, History, ChevronDown, ChevronRight } from 'lucide-react';
import SearchableDropdown from '../components/SearchableDropdown';

interface ModelHistoryProps {
  jobOrderSearch: string;
  setJobOrderSearch: (value: string) => void;
  loadModelHistory: (jobOrderNumber?: string) => void;
  modelHistoryLoading: boolean;
  modelHistoryData: ModelHistoryResponse | null;
  jobOrderOptions: { job_order_number: string; model_name: string | null }[];
}

const ModelHistory: React.FC<ModelHistoryProps> = ({
  jobOrderSearch,
  setJobOrderSearch,
  loadModelHistory,
  modelHistoryLoading,
  modelHistoryData,
  jobOrderOptions
}) => {
  const { t } = useTranslation();
  const [selectedEntry, setSelectedEntry] = useState<ModelHistoryEntry | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedColors, setExpandedColors] = useState<Set<string>>(new Set());
  const [batchDetails, setBatchDetails] = useState<JobOrderItemBatchDetails | null>(null);
  const [loadingBatchDetails, setLoadingBatchDetails] = useState(false);
  const [expandedPhaseGroups, setExpandedPhaseGroups] = useState<Set<string>>(new Set());

  const dropdownOptions = jobOrderOptions.map(o =>
    o.model_name && o.model_name !== o.job_order_number
      ? `${o.job_order_number} (${o.model_name})`
      : o.job_order_number
  );

  const filterOption = (option: string, search: string) => {
    const lower = search.toLowerCase();
    return option.toLowerCase().includes(lower);
  };

  const selectedOption = (() => {
    const found = jobOrderOptions.find(
      o => o.job_order_number === jobOrderSearch
    );
    return found && found.model_name && found.model_name !== found.job_order_number
      ? `${found.job_order_number} (${found.model_name})`
      : jobOrderSearch;
  })();

  const handleSearch = () => {
    const jobOrderNumber = jobOrderSearch.trim();
    loadModelHistory(jobOrderNumber || undefined);
  };

  const toggleColorExpansion = (colorKey: string) => {
    const newExpanded = new Set(expandedColors);
    if (newExpanded.has(colorKey)) {
      newExpanded.delete(colorKey);
    } else {
      newExpanded.add(colorKey);
    }
    setExpandedColors(newExpanded);
  };


  const formatDuration = (minutes: number | null | undefined) => {
    if (minutes === null || minutes === undefined || isNaN(minutes)) {
      return '-';
    }
    if (minutes < 60) {
      return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  };

  const formatDateTime = (dateTime: string | null | undefined) => {
    if (!dateTime) return '-';
    const date = new Date(dateTime);
    if (isNaN(date.getTime())) return 'N/A';
    return date.toLocaleString();
  };

  const openEntryModal = async (entry: ModelHistoryEntry) => {
    setSelectedEntry(entry);
    setIsModalOpen(true);
    
    // Find the item_id from the model history data
    const itemId = getItemIdFromEntry(entry);
    if (itemId) {
      setLoadingBatchDetails(true);
      try {
        const details = await statisticsApi.getJobOrderItemBatchDetails(itemId);
        setBatchDetails(details);
      } catch (error) {
        console.error('Error loading batch details:', error);
        setBatchDetails(null);
      } finally {
        setLoadingBatchDetails(false);
      }
    }
  };

  const getItemIdFromEntry = (entry: ModelHistoryEntry): number | null => {
    if (!modelHistoryData || !modelHistoryData.job_order_color_groups) {
      return null;
    }

    // Find the item_id from the model history data structure
    for (const [key, group] of Object.entries(modelHistoryData.job_order_color_groups)) {
      for (const [sizeKey, sizeData] of Object.entries(group.sizes)) {
        if (sizeData.entries.some(e => 
          e.model_name === entry.model_name &&
          e.color_name === entry.color_name &&
          e.size_value === entry.size_value &&
          e.job_order_number === entry.job_order_number &&
          e.phase_name === entry.phase_name
        )) {
          return sizeData.item_id;
        }
      }
    }
    return null;
  };

  const togglePhaseGroupExpansion = (phaseStatusKey: string) => {
    const newExpanded = new Set(expandedPhaseGroups);
    if (newExpanded.has(phaseStatusKey)) {
      newExpanded.delete(phaseStatusKey);
    } else {
      newExpanded.add(phaseStatusKey);
    }
    setExpandedPhaseGroups(newExpanded);
  };

  const getPhaseOrderIndex = (phaseName?: string | null) => {
    if (!phaseName) return 9999;
    const n = phaseName.toLowerCase();
    if (n.includes('cut')) return 1;
    if (n.startsWith('sew')) {
      const m = n.match(/(\d+)/);
      return m ? 10 + parseInt(m[1], 10) : 10;
    }
    if (n.includes('pack')) return 100;
    return 9999;
  };

  const getJobOrderColorGroups = () => {
    if (!modelHistoryData || !modelHistoryData.job_order_color_groups) {
      return {};
    }
    return modelHistoryData.job_order_color_groups;
  };

  const filteredData = getJobOrderColorGroups();
  
  // Debug: Log the data structure to understand what we're getting
  React.useEffect(() => {
    if (modelHistoryData) {
      console.log('ModelHistory - Full data structure:', modelHistoryData);
      console.log('ModelHistory - Job order color groups:', modelHistoryData.job_order_color_groups);
      console.log('ModelHistory - Number of groups:', Object.keys(modelHistoryData.job_order_color_groups || {}).length);
    }
  }, [modelHistoryData]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Model History
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 mb-6 items-center">
            <div className="flex-1">
              <SearchableDropdown
                value={selectedOption}
                onChange={val => {
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
                disabled={modelHistoryLoading}
                className="h-10"
              />
            </div>
            <Button
              onClick={() => loadModelHistory(jobOrderSearch.trim() || undefined)}
              disabled={modelHistoryLoading || !jobOrderSearch.trim()}
              className="flex items-center gap-2 h-10"
            >
              {modelHistoryLoading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                <Search className="h-4 w-4" />
              )}
              Search
            </Button>
          </div>

          {modelHistoryLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-2 text-gray-600">Loading model history...</span>
            </div>
          ) : Object.keys(filteredData).length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Package className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p>No model history data found</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(filteredData).map(([key, group]) => {
                const isExpanded = expandedColors.has(key);
                return (
                  <div key={key} className="border rounded-lg p-4">
                    <div 
                      className="flex items-center justify-between mb-4 cursor-pointer hover:bg-gray-50 p-2 rounded transition-colors"
                      onClick={() => toggleColorExpansion(key)}
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="h-5 w-5 text-gray-600" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-gray-600" />
                        )}
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">
                            {group.model_name || 'Unknown'} - {group.color_name || 'Unknown'}
                          </h3>
                        <p className="text-sm text-gray-600">
                          {group.total_entries || 0} entries • Total time: {(() => {
                            // Calculate total time from earliest entry to latest exit across all sizes
                            let earliestTime: Date | null = null;
                            let latestTime: Date | null = null;
                            
                            Object.values(group.sizes).forEach(sizeData => {
                              sizeData.entries.forEach(entry => {
                                // Check entry time
                                if (entry.entry_time) {
                                  const entryDate = new Date(entry.entry_time);
                                  if (!isNaN(entryDate.getTime())) {
                                    if (!earliestTime || entryDate < earliestTime) {
                                      earliestTime = entryDate;
                                    }
                                  }
                                }
                                
                                // Check exit time
                                if (entry.exit_time) {
                                  const exitDate = new Date(entry.exit_time);
                                  if (!isNaN(exitDate.getTime())) {
                                    if (!latestTime || exitDate > latestTime) {
                                      latestTime = exitDate;
                                    }
                                  }
                                }
                              });
                            });
                            
                            // If no exit times found, use current time
                            if (earliestTime && !latestTime) {
                              latestTime = new Date();
                            }
                            
                            if (earliestTime && latestTime) {
                              const totalMinutes = Math.round((latestTime.getTime() - earliestTime.getTime()) / (1000 * 60));
                              return formatDuration(totalMinutes);
                            }
                            
                            return 'N/A';
                          })()}
                        </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <TrendingUp className="h-4 w-4" />
                        <span>Avg: {formatDuration(group.total_entries > 0 ? Math.round(group.total_duration_minutes / group.total_entries) : 0)}</span>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="space-y-4">
                        {Object.entries(group.sizes).map(([sizeKey, sizeData]) => (
                          <div key={sizeKey} className="bg-gray-50 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="font-medium text-gray-800">Size: {sizeData.size_value || 'Unknown'}</h4>
                              <div className="text-sm text-gray-600">
                                {sizeData.entry_count || 0} entries • {formatDuration(sizeData.total_duration_minutes)}
                              </div>
                            </div>

                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Phase</TableHead>
                                    <TableHead>Entry Time</TableHead>
                                    <TableHead>Exit Time</TableHead>
                                    <TableHead>Duration</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Quantity</TableHead>
                                    <TableHead>Actions</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {(() => {
                                    // Group entries by phase
                                    const phaseGroups = sizeData.entries.reduce((acc, entry) => {
                                      const phaseKey = entry.phase_name || 'Unknown';
                                      if (!acc[phaseKey]) {
                                        acc[phaseKey] = [];
                                      }
                                      acc[phaseKey].push(entry);
                                      return acc;
                                    }, {} as { [phase: string]: ModelHistoryEntry[] });

                                    const sortedPhases = Object.keys(phaseGroups).sort((a, b) => {
                                      const ai = getPhaseOrderIndex(a);
                                      const bi = getPhaseOrderIndex(b);
                                      if (ai !== bi) return ai - bi;
                                      return a.localeCompare(b);
                                    });

                                    return sortedPhases.map((phaseName, phaseIndex) => {
                                      const phaseEntries = phaseGroups[phaseName];
                                      
                                      // Calculate aggregated values
                                      const totalQuantity = phaseEntries.reduce((sum, entry) => sum + (entry.quantity || 0), 0);
                                      
                                      // Find earliest entry time from scan_in across the current phase
                                      const entryTimes = phaseEntries
                                        .map(entry => entry.entry_time)
                                        .filter(time => time)
                                        .map(time => new Date(time!))
                                        .filter(date => !isNaN(date.getTime()));
                                      const earliestEntryTime = entryTimes.length > 0 
                                        ? new Date(Math.min(...entryTimes.map(d => d.getTime())))
                                        : null;

                                      // Find latest exit time
                                      const exitTimes = phaseEntries
                                        .map(entry => entry.exit_time)
                                        .filter(time => time)
                                        .map(time => new Date(time!))
                                        .filter(date => !isNaN(date.getTime()));
                                      const latestExitTimeRaw = exitTimes.length > 0 
                                        ? new Date(Math.max(...exitTimes.map(d => d.getTime())))
                                        : null;

                                      const currentPhaseIndex = getPhaseOrderIndex(phaseName);
                                      const allPrevAndCurrentCompletedForExit = Object.keys(phaseGroups).every(pn => {
                                        const idx = getPhaseOrderIndex(pn);
                                        if (idx > currentPhaseIndex) return true;
                                        const entriesForPn = phaseGroups[pn];
                                        if (entriesForPn.length === 0) return true;
                                        return entriesForPn.every(e => e.status === 'Completed');
                                      });

                                      const latestExitTime = allPrevAndCurrentCompletedForExit ? latestExitTimeRaw : null;

                                      // Calculate duration
                                      let duration: number | null = null;
                                      if (earliestEntryTime) {
                                        if (latestExitTime) {
                                          duration = Math.round((latestExitTime.getTime() - earliestEntryTime.getTime()) / (1000 * 60)); // minutes
                                        } else {
                                          // If no exit time, calculate from entry time to current time
                                          duration = Math.round((new Date().getTime() - earliestEntryTime.getTime()) / (1000 * 60)); // minutes
                                        }
                                      }

                                      const entriesUpToCurrent = Object.keys(phaseGroups)
                                        .filter(pn => getPhaseOrderIndex(pn) <= currentPhaseIndex)
                                        .flatMap(pn => phaseGroups[pn]);
                                      const hasAnyEntriesUpToCurrent = entriesUpToCurrent.length > 0;
                                      const allPrevAndCurrentCompletedStatus = hasAnyEntriesUpToCurrent && entriesUpToCurrent.every(e => e.status === 'Completed');
                                      const anyInProgressUpToCurrent = entriesUpToCurrent.some(e => e.status === 'In Progress');
                                      const anyPendingUpToCurrent = entriesUpToCurrent.some(e => e.status === 'Pending');
                                      const overallStatus = allPrevAndCurrentCompletedStatus 
                                        ? 'Completed' 
                                        : anyInProgressUpToCurrent 
                                        ? 'In Progress' 
                                        : 'Pending';

                                      return (
                                        <TableRow key={phaseIndex}>
                                          <TableCell>{phaseName}</TableCell>
                                          <TableCell>{formatDateTime(earliestEntryTime?.toISOString())}</TableCell>
                                          <TableCell>
                                            {latestExitTime ? formatDateTime(latestExitTime.toISOString()) : 'N/A'}
                                          </TableCell>
                                          <TableCell>
                                            {duration ? formatDuration(duration) : 'N/A'}
                                          </TableCell>
                                          <TableCell>
                                            <span className={`px-2 py-1 rounded-full text-xs ${
                                              overallStatus === 'Completed' 
                                                ? 'bg-green-100 text-green-800'
                                                : overallStatus === 'In Progress'
                                                ? 'bg-blue-100 text-blue-800'
                                                : 'bg-yellow-100 text-yellow-800'
                                            }`}>
                                              {overallStatus}
                                            </span>
                                          </TableCell>
                                          <TableCell>{totalQuantity}</TableCell>
                                          <TableCell>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() => openEntryModal(phaseEntries[0])}
                                            >
                                              <Eye className="h-4 w-4" />
                                            </Button>
                                          </TableCell>
                                        </TableRow>
                                      );
                                    });
                                  })()}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Entry Details & Batch Information</DialogTitle>
            </DialogHeader>
            
            {selectedEntry && (
              <div className="space-y-6">
                {/* Batch Details Section */}
                <div className="border rounded-lg p-4">
                  <h3 className="text-lg font-semibold mb-4">Batch Details for {selectedEntry.model_name} - {selectedEntry.color_name} - {selectedEntry.size_value}</h3>
                  
                  {loadingBatchDetails ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      <span className="ml-2 text-gray-600">Loading batch details...</span>
                    </div>
                  ) : batchDetails ? (
                    <div className="space-y-4">
                      {/* Quantity Summary */}
                      <div className="bg-gray-50 rounded-lg p-4">
                        <h4 className="font-medium text-gray-800 mb-3">Quantity Summary</h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm font-medium text-gray-600">Expected Quantity</label>
                            <p className="text-xl font-bold text-blue-600">{batchDetails.expected_quantity}</p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-gray-600">Total Batch Quantity</label>
                            <p className="text-xl font-bold text-green-600">{batchDetails.total_batch_quantity}</p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-gray-600">Remaining Quantity</label>
                            <p className={`text-xl font-bold ${batchDetails.remaining_quantity > 0 ? 'text-orange-600' : 'text-gray-600'}`}>
                              {batchDetails.remaining_quantity}
                            </p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-gray-600">Completion %</label>
                            <p className="text-xl font-bold text-purple-600">
                              {Math.round((batchDetails.total_batch_quantity / batchDetails.expected_quantity) * 100)}%
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Batch Groups by Phase and Status */}
                      <div>
                        <h4 className="font-medium text-gray-800 mb-3">Batches by Phase & Status</h4>
                        <div className="space-y-3">
                          {batchDetails.phase_status_groups.map((group) => {
                            const phaseStatusKey = `${group.phase_name}_${group.status}`;
                            const isExpanded = expandedPhaseGroups.has(phaseStatusKey);
                            
                            return (
                              <div key={phaseStatusKey} className="border rounded-lg">
                                <div 
                                  className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50 transition-colors"
                                  onClick={() => togglePhaseGroupExpansion(phaseStatusKey)}
                                >
                                  <div className="flex items-center gap-3">
                                    {isExpanded ? (
                                      <ChevronDown className="h-4 w-4 text-gray-600" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4 text-gray-600" />
                                    )}
                                    <div>
                                      <span className="font-medium">{group.phase_name}</span>
                                      <span className={`ml-2 px-2 py-1 rounded-full text-xs ${
                                        group.status === 'Completed' 
                                          ? 'bg-green-100 text-green-800'
                                          : group.status === 'In Progress'
                                          ? 'bg-blue-100 text-blue-800'
                                          : 'bg-yellow-100 text-yellow-800'
                                      }`}>
                                        {group.status}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="text-sm text-gray-600">
                                    {group.batch_count} batches • {group.total_quantity} units
                                  </div>
                                </div>

                                {isExpanded && (
                                  <div className="border-t p-3 bg-gray-50">
                                    <div className="space-y-2">
                                      {group.batches.map((batch) => (
                                        <div key={batch.batch_id} className="flex items-center justify-between bg-white p-2 rounded border">
                                          <div className="flex items-center gap-3">
                                            <span className="font-mono text-sm">{batch.barcode}</span>
                                            {batch.is_second_degree && (
                                              <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded">
                                                2nd Degree
                                              </span>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-4 text-sm">
                                            <span>Qty: {batch.quantity}</span>
                                            <span className="text-gray-500">
                                              {batch.last_updated_at ? formatDateTime(batch.last_updated_at) : 'N/A'}
                                            </span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <Package className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                      <p>No batch details available</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default ModelHistory;
