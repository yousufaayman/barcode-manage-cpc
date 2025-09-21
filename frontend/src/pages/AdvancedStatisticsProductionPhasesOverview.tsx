import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Activity, Clock, Package, TrendingUp, Filter } from 'lucide-react';
import SearchableDropdown from '../components/SearchableDropdown';

export interface ProductionPhasesOverviewProps {
  phasesData: {[phaseName: string]: {
    [status: string]: {
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
      daily_throughput: {scanned_in: number; completed: number; efficiency_ratio: number};
    };
  }};
  phasesLoading: boolean;
  phasesColorSearch: string;
  setPhasesColorSearch: (v: string) => void;
  phasesModelSearch: string;
  setPhasesModelSearch: (v: string) => void;
  loadPhasesData: (phaseName: string) => void;
  availablePhases: { phase_id: number; phase_name: string }[];
}

const ProductionPhasesOverview: React.FC<ProductionPhasesOverviewProps> = ({
  phasesData,
  phasesLoading,
  phasesColorSearch,
  setPhasesColorSearch,
  phasesModelSearch,
  setPhasesModelSearch,
  loadPhasesData,
  availablePhases,
}) => {
  const [selectedPhase, setSelectedPhase] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>('Pending');
  const [phaseLoadingStates, setPhaseLoadingStates] = useState<{ [phaseName: string]: boolean }>({});
  const [phasesLoaded, setPhasesLoaded] = useState(false);


  // No need to clear loaded phase details when filters change - we do live filtering instead

  // Set phases loaded when we have available phases
  useEffect(() => {
    if (availablePhases && availablePhases.length > 0) {
      setPhasesLoaded(true);
    }
  }, [availablePhases]);

  const handlePhaseClick = async (phaseName: string) => {
    if (selectedPhase === phaseName) {
      setSelectedPhase(null);
      return;
    }

    setSelectedPhase(phaseName);
    setSelectedStatus('Pending'); // Reset to default status
    
    // Load all data for this phase
    setPhaseLoadingStates(prev => ({ ...prev, [phaseName]: true }));

    try {
      await loadPhasesData(phaseName);
    } catch (error) {
      console.error(`Failed to load details for phase ${phaseName}:`, error);
    } finally {
      setPhaseLoadingStates(prev => ({ ...prev, [phaseName]: false }));
    }
  };

  const getPhaseIcon = (phaseName: string) => {
    if (phaseName.toLowerCase().includes('sewing')) return <Clock className="h-5 w-5 text-yellow-600" />;
    if (phaseName === 'Packaging') return <Package className="h-5 w-5 text-orange-600" />;
    if (phaseName === 'Cutting') return <TrendingUp className="h-5 w-5 text-blue-600" />;
    return <Activity className="h-5 w-5 text-gray-600" />;
  };

  const getPhaseColor = (phaseName: string) => {
    if (phaseName.toLowerCase().includes('sewing')) return 'border-yellow-500 bg-yellow-50';
    if (phaseName === 'Packaging') return 'border-orange-500 bg-orange-50';
    if (phaseName === 'Cutting') return 'border-blue-500 bg-blue-50';
    return 'border-gray-500 bg-gray-50';
  };

  // No need for filteredPhasesData since we do live filtering on the loaded data

  // Get available colors from current phase and status data
  const colorOptions = useMemo(() => {
    if (!selectedPhase || !phasesData[selectedPhase] || !phasesData[selectedPhase][selectedStatus]) return [];
    
    const colors = new Set<string>();
    Object.values(phasesData[selectedPhase][selectedStatus].model_color_groups || {}).forEach((group: any) => {
      if (group.color_name) {
        colors.add(group.color_name);
      }
    });
    return Array.from(colors).sort();
  }, [selectedPhase, selectedStatus, phasesData]);

  // Get available models from current phase and status data
  const modelOptions = useMemo(() => {
    if (!selectedPhase || !phasesData[selectedPhase] || !phasesData[selectedPhase][selectedStatus]) return [];
    
    const models = new Set<string>();
    Object.values(phasesData[selectedPhase][selectedStatus].model_color_groups || {}).forEach((group: any) => {
      if (group.model_name) {
        models.add(group.model_name);
      }
    });
    return Array.from(models).sort();
  }, [selectedPhase, selectedStatus, phasesData]);

  // Status options
  const statusOptions = ['Pending', 'In Progress', 'Completed'];

  // Get phases to display
  const displayPhases = useMemo(() => {
    return availablePhases.map(phase => phase.phase_name);
  }, [availablePhases]);

  // Get available statuses for the selected phase
  const getAvailableStatuses = (phaseName: string) => {
    if (!phasesData[phaseName]) return ['Pending', 'In Progress'];
    
    const availableStatuses = Object.keys(phasesData[phaseName]);
    if (phaseName === 'Packaging' && availableStatuses.includes('Completed')) {
      return ['Pending', 'In Progress', 'Completed'];
    }
    return ['Pending', 'In Progress'];
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Production Phases Overview
          </div>
          <button
            onClick={() => selectedPhase && loadPhasesData(selectedPhase)}
            disabled={phasesLoading}
            className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm"
          >
            {phasesLoading ? (
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
            ) : (
              <Activity className="h-3 w-3" />
            )}
            Refresh
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent>

        {phasesLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-gray-600">Loading phases data...</span>
          </div>
        ) : displayPhases.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No phases available
          </div>
        ) : (
          <div className="space-y-4">
            {/* Phase Tabs */}
            <div className="bg-white rounded-lg border border-gray-200 p-1">
              <div className="flex flex-wrap gap-1">
                {displayPhases.map((phaseName) => {
                  const isSelected = selectedPhase === phaseName;
                  const isLoading = phaseLoadingStates[phaseName];
                  const isLoaded = !!phasesData[phaseName];

                  return (
                    <button
                      key={phaseName}
                      onClick={() => handlePhaseClick(phaseName)}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-md font-medium text-sm transition-all duration-200 ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                    >
                      {getPhaseIcon(phaseName)}
                      <span>{phaseName}</span>
                      {isLoading && (
                        <div className={`animate-spin rounded-full h-3 w-3 border-b-2 ${
                          isSelected ? 'border-white' : 'border-blue-600'
                        }`}></div>
                      )}
                      {isLoaded && !isLoading && (
                        <div className={`w-2 h-2 rounded-full ${
                          isSelected ? 'bg-blue-200' : 'bg-green-500'
                        }`}></div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected Phase Content */}
            {selectedPhase && phasesData[selectedPhase] && (
              <div className="space-y-4">
                {/* Status Tabs */}
                <div className="bg-white rounded-lg border border-gray-200 p-1">
                  <div className="flex space-x-1">
                    {getAvailableStatuses(selectedPhase).map((status) => (
                      <button
                        key={status}
                        onClick={() => setSelectedStatus(status)}
                        className={`relative flex-1 py-2.5 px-4 text-sm font-medium rounded-md transition-all duration-200 ${
                          selectedStatus === status
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center justify-center gap-2">
                          <span>{status}</span>
                          {phasesData[selectedPhase][status] && (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              selectedStatus === status
                                ? 'bg-blue-500 text-white'
                                : 'bg-gray-200 text-gray-600'
                            }`}>
                              {Object.keys(phasesData[selectedPhase][status].model_color_groups || {}).length}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Filters for Selected Phase and Status */}
                {phasesData[selectedPhase][selectedStatus] && (
                  <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-2">
                        <Filter className="h-5 w-5 text-gray-600" />
                        <h3 className="text-lg font-semibold text-gray-900">
                          Filters
                        </h3>
                        <span className="text-sm text-gray-500">
                          {selectedPhase} • {selectedStatus}
                        </span>
                      </div>
                      <Button
                        onClick={() => {
                          setPhasesColorSearch('');
                          setPhasesModelSearch('');
                        }}
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
                      >
                        <Filter className="h-4 w-4" />
                        Clear
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label htmlFor="color-search" className="block text-sm font-medium text-gray-700">
                          Color
                        </label>
                        <SearchableDropdown
                          value={phasesColorSearch}
                          onChange={setPhasesColorSearch}
                          options={colorOptions}
                          placeholder="Select or type color..."
                          label=""
                          disabled={phasesLoading}
                          className="h-10"
                        />
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="model-search" className="block text-sm font-medium text-gray-700">
                          Model
                        </label>
                        <SearchableDropdown
                          value={phasesModelSearch}
                          onChange={setPhasesModelSearch}
                          options={modelOptions}
                          placeholder="Select or type model..."
                          label=""
                          disabled={phasesLoading}
                          className="h-10"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Phase-Level Daily Throughput */}
                {phasesData[selectedPhase][selectedStatus] && (
                  <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <Activity className="h-5 w-5 text-blue-600" />
                      <h4 className="text-lg font-semibold text-gray-900">Daily Throughput</h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="text-center p-4 bg-gray-50 rounded-lg">
                        <div className="text-2xl font-bold text-blue-600">
                          {phasesData[selectedPhase][selectedStatus].daily_throughput.scanned_in}
                        </div>
                        <div className="text-sm text-gray-600">
                          {selectedStatus === 'Pending' ? 'Set to Pending' : 
                           selectedStatus === 'In Progress' ? 'Scanned In' : 'N/A'}
                        </div>
                      </div>
                      <div className="text-center p-4 bg-gray-50 rounded-lg">
                        <div className="text-2xl font-bold text-green-600">
                          {phasesData[selectedPhase][selectedStatus].daily_throughput.completed}
                        </div>
                        <div className="text-sm text-gray-600">
                          {selectedStatus === 'Pending' ? 'Moved to In Progress' : 
                           selectedStatus === 'In Progress' ? 'Moved to Completed' : 'Moved to Completed'}
                        </div>
                      </div>
                      <div className="text-center p-4 bg-gray-50 rounded-lg">
                        <div className="text-2xl font-bold text-purple-600">
                          {phasesData[selectedPhase][selectedStatus].daily_throughput.efficiency_ratio}
                        </div>
                        <div className="text-sm text-gray-600">Completion Rate</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Model/Color Groups */}
                {phasesData[selectedPhase][selectedStatus] && (
                  <div className="space-y-4">
                    {(() => {
                      // Apply filters to the current phase and status data
                      const statusData = phasesData[selectedPhase][selectedStatus];
                      if (!statusData || !statusData.model_color_groups) return null;
                      
                      let filteredGroups = Object.entries(statusData.model_color_groups);
                      
                      // Apply color filter
                      if (phasesColorSearch.trim()) {
                        filteredGroups = filteredGroups.filter(([key, group]: any) => 
                          group.color_name && group.color_name.toLowerCase().includes(phasesColorSearch.toLowerCase())
                        );
                      }
                      
                      // Apply model filter
                      if (phasesModelSearch.trim()) {
                        filteredGroups = filteredGroups.filter(([key, group]: any) => 
                          group.model_name && group.model_name.toLowerCase().includes(phasesModelSearch.toLowerCase())
                        );
                      }
                      
                      if (filteredGroups.length === 0 && (phasesColorSearch.trim() || phasesModelSearch.trim())) {
                        return (
                          <div className="text-center py-8 text-gray-500">
                            <Package className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                            <p>No groups match your filter criteria</p>
                            <p className="text-sm">Try adjusting your filters or clear them to see all data</p>
                          </div>
                        );
                      }
                    
                    return filteredGroups.map(([key, group]: any) => (
                    <details key={key} className="group">
                      <summary className={`p-4 rounded-lg border cursor-pointer hover:shadow-sm transition-all duration-200 list-none ${
                        group.second_degree_sizes.length > 0
                          ? 'bg-white border-red-200 hover:border-red-300'
                          : 'bg-white border-gray-200 hover:border-gray-300'
                      }`}>
                        {/* Enhanced Group Header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div>
                              <h3 className="text-base font-semibold text-gray-900">
                                <span className="text-blue-600">{group.model_name}</span>
                                <span className="text-gray-400 mx-2">•</span>
                                <span className="text-gray-700">{group.color_name}</span>
                              </h3>
                              {group.second_degree_sizes.length > 0 && (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 mt-1">
                                  2nd Degree
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-6">
                            <div className="text-right">
                              <div className="text-lg font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-lg">
                                {group.total_quantity}
                                {group.expected_quantity > 0 ? `/${group.expected_quantity}` : ''} units
                              </div>
                              <div className="text-sm font-medium text-orange-600 bg-orange-50 px-3 py-1 rounded-lg mt-2">
                                {group.time_in_phase}
                              </div>
                            </div>
                            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 group-hover:bg-gray-200 transition-colors">
                              <svg className="w-4 h-4 text-gray-600 group-open:rotate-180 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </div>
                        </div>
                      </summary>
                      {/* Size Cards */}
                      <div className="mt-4 space-y-4">
                        {/* Regular Sizes */}
                        {group.sizes.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold text-gray-900 mb-3">Regular Items</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                              {group.sizes.map((size: any, index: number) => (
                                <div key={`regular-${index}`} className="p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
                                  <div className="text-center">
                                    <div className="text-sm font-semibold text-gray-900 mb-3">Size {size.size_value}</div>
                                    <div className="text-2xl font-bold text-blue-600 bg-blue-50 px-3 py-2 rounded-lg mb-2">
                                      {size.quantity}
                                      {size.expected_quantity > 0 && (
                                        <span className="text-sm font-normal text-blue-500 ml-1">
                                          /{size.expected_quantity}
                                        </span>
                                      )}
                                    </div>
                                    {size.expected_quantity > 0 && (
                                      <div className={`text-xs font-medium mb-2 px-2 py-1 rounded-full ${
                                        size.quantity >= size.expected_quantity ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                                      }`}>
                                        {Math.round((size.quantity / size.expected_quantity) * 100)}% complete
                                      </div>
                                    )}
                                    <div className="text-xs text-gray-500 mb-2">
                                      {size.batch_count} batch{size.batch_count > 1 ? 'es' : ''}
                                    </div>
                                    <div className="text-sm font-medium text-orange-600 bg-orange-50 px-2 py-1 rounded-lg">
                                      {size.time_in_phase}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* Second Degree Sizes */}
                        {group.second_degree_sizes.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold text-red-700 mb-3">Second Degree Items</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                              {group.second_degree_sizes.map((size: any, index: number) => (
                                <div key={`second-degree-${index}`} className="p-4 bg-red-50 rounded-lg border border-red-200 hover:border-red-300 transition-colors">
                                  <div className="text-center">
                                    <div className="text-sm font-semibold text-red-700 mb-3">Size {size.size_value}</div>
                                    <div className="text-2xl font-bold text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-2">
                                      {size.quantity}
                                      {size.expected_quantity > 0 && (
                                        <span className="text-sm font-normal text-red-500 ml-1">
                                          /{size.expected_quantity}
                                        </span>
                                      )}
                                    </div>
                                    {size.expected_quantity > 0 && (
                                      <div className={`text-xs font-medium mb-2 px-2 py-1 rounded-full ${
                                        size.quantity >= size.expected_quantity ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                                      }`}>
                                        {Math.round((size.quantity / size.expected_quantity) * 100)}% complete
                                      </div>
                                    )}
                                    <div className="text-xs text-red-500 mb-2">
                                      {size.batch_count} batch{size.batch_count > 1 ? 'es' : ''}
                                    </div>
                                    <div className="text-sm font-medium text-orange-600 bg-orange-50 px-2 py-1 rounded-lg">
                                      {size.time_in_phase}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </details>
                  ));
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* No Phase Selected */}
            {!selectedPhase && (
              <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
                <Activity className="h-16 w-16 mx-auto mb-6 text-gray-300" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Select a Phase</h3>
                <p className="text-gray-500 max-w-md mx-auto">
                  Click on any phase tab above to load its detailed information
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ProductionPhasesOverview;