import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Activity, Clock, Package, TrendingUp } from 'lucide-react';

export interface ProductionPhasesOverviewProps {
  phasesData: any;
  phasesLoading: boolean;
  phasesModelSearch: string;
  setPhasesModelSearch: (v: string) => void;
  phasesColorSearch: string;
  setPhasesColorSearch: (v: string) => void;
  loadPhasesData: () => void;
  getFilteredPhasesData: () => any;
}

const ProductionPhasesOverview: React.FC<ProductionPhasesOverviewProps> = ({
  phasesData,
  phasesLoading,
  phasesModelSearch,
  setPhasesModelSearch,
  phasesColorSearch,
  setPhasesColorSearch,
  loadPhasesData,
  getFilteredPhasesData,
}) => {
  const [selectedPhase, setSelectedPhase] = useState<string | null>(null);
  const [phaseLoadingStates, setPhaseLoadingStates] = useState<{ [phaseName: string]: boolean }>({});
  const [loadedPhaseDetails, setLoadedPhaseDetails] = useState<{ [phaseName: string]: any }>({});
  const [renderCount, setRenderCount] = useState(0);

  // Debug effect to monitor search changes
  useEffect(() => {
    console.log('Search values changed:', { phasesModelSearch, phasesColorSearch });
  }, [phasesModelSearch, phasesColorSearch]);

  // Debug effect to monitor all props
  useEffect(() => {
    console.log('Component props:', {
      phasesData,
      phasesLoading,
      phasesModelSearch,
      phasesColorSearch,
      loadPhasesData: typeof loadPhasesData,
      getFilteredPhasesData: typeof getFilteredPhasesData
    });
  }, [phasesData, phasesLoading, phasesModelSearch, phasesColorSearch, loadPhasesData, getFilteredPhasesData]);

  // Debug effect to monitor renders
  useEffect(() => {
    setRenderCount(prev => prev + 1);
    console.log('Component rendered, count:', renderCount + 1);
  });

  const handlePhaseClick = async (phaseName: string) => {
    if (selectedPhase === phaseName) {
      setSelectedPhase(null);
      return;
    }

    setSelectedPhase(phaseName);
    
    // If phase details are already loaded, don't reload
    if (loadedPhaseDetails[phaseName]) {
      return;
    }

    // Set loading state for this phase
    setPhaseLoadingStates(prev => ({ ...prev, [phaseName]: true }));

    try {
      // Simulate API call - replace with actual API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Get the phase data from the existing data structure
      const currentFilteredData = getFilteredPhasesData();
      const phaseData = currentFilteredData[phaseName];
      if (phaseData) {
        setLoadedPhaseDetails(prev => ({ ...prev, [phaseName]: phaseData }));
      }
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

  const filteredPhasesData = useMemo(() => {
    console.log('useMemo triggered for filteredPhasesData');
    const data = getFilteredPhasesData();
    console.log('Filtered Phases Data:', data);
    console.log('Model Search:', phasesModelSearch);
    console.log('Color Search:', phasesColorSearch);
    return data;
  }, [getFilteredPhasesData, phasesModelSearch, phasesColorSearch]);
  
  // Validate data structure
  if (!filteredPhasesData || typeof filteredPhasesData !== 'object') {
    console.error('Invalid filteredPhasesData:', filteredPhasesData);
    return (
      <Card>
        <CardHeader>
          <CardTitle>Production Phases Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-red-500">
            Invalid data structure received
          </div>
        </CardContent>
      </Card>
    );
  }
  
  const filteredPhases = useMemo(() => {
    return Object.keys(filteredPhasesData).filter(phaseName => {
      const phaseData = filteredPhasesData[phaseName];
      console.log(`Phase ${phaseName} data:`, phaseData);
      
      if (!phaseData || !phaseData.model_color_groups) {
        console.warn(`Phase ${phaseName} missing model_color_groups:`, phaseData);
        return false;
      }
      
      const modelColorGroups = Object.values(phaseData.model_color_groups);
      console.log(`Phase ${phaseName} model_color_groups:`, modelColorGroups);
      return modelColorGroups.length > 0;
    });
  }, [filteredPhasesData]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Production Phases Overview
          </div>
          <button
            onClick={loadPhasesData}
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
        {/* Search Filters */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label htmlFor="model-search" className="block text-sm font-medium text-gray-700 mb-1">
                Search by Model
              </label>
              <Input
                id="model-search"
                type="text"
                placeholder="Enter model name..."
                value={phasesModelSearch}
                onChange={(e) => {
                  console.log('Model search changed:', e.target.value);
                  setPhasesModelSearch(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    console.log('Model search Enter pressed');
                  }
                }}
                className="w-full"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="color-search" className="block text-sm font-medium text-gray-700 mb-1">
                Search by Color
              </label>
              <Input
                id="color-search"
                type="text"
                placeholder="Enter color name..."
                value={phasesColorSearch}
                onChange={(e) => {
                  console.log('Color search changed:', e.target.value);
                  setPhasesColorSearch(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    console.log('Color search Enter pressed');
                  }
                }}
                className="w-full"
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => {
                  console.log('Clear filters clicked');
                  setPhasesModelSearch('');
                  setPhasesColorSearch('');
                }}
                variant="outline"
                className="w-full sm:w-auto"
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </div>

        {phasesLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-gray-600">Loading phases data...</span>
          </div>
        ) : filteredPhases.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No production phases data available
          </div>
        ) : (
          <div className="space-y-4">
            {/* Phase Tabs */}
            <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-4">
              {filteredPhases.map((phaseName) => {
                const phaseData = filteredPhasesData[phaseName];
                const modelColorGroups = Object.values(phaseData.model_color_groups);
                const totalGroups = modelColorGroups.length;
                const isSelected = selectedPhase === phaseName;
                const isLoading = phaseLoadingStates[phaseName];
                const isLoaded = !!loadedPhaseDetails[phaseName];

                return (
                  <button
                    key={phaseName}
                    onClick={() => handlePhaseClick(phaseName)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all duration-200 ${
                      isSelected 
                        ? getPhaseColor(phaseName) + ' shadow-md'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    {getPhaseIcon(phaseName)}
                    <span className={`font-medium ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>
                      {phaseName}
                    </span>
                    <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded-full">
                      {totalGroups}
                    </span>
                    {isLoading && (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    )}
                    {isLoaded && !isLoading && (
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Selected Phase Content */}
            {selectedPhase && loadedPhaseDetails[selectedPhase] && (
              <div className="space-y-4">
                {/* Phase-Level Daily Throughput */}
                <div className="p-4 bg-blue-50 rounded-lg">
                  <h4 className="text-sm font-medium text-blue-900 mb-2">Daily Throughput Summary</h4>
                  <div className="text-center p-3 bg-white rounded-lg">
                    <div className="text-sm font-medium text-gray-700">{selectedPhase}</div>
                    <div className="text-lg font-bold text-blue-600">
                      {loadedPhaseDetails[selectedPhase].daily_throughput.scanned_in_not_out} → {loadedPhaseDetails[selectedPhase].daily_throughput.completed}
                    </div>
                    <div className="text-xs text-gray-500">
                      Efficiency: {loadedPhaseDetails[selectedPhase].daily_throughput.efficiency_ratio}
                    </div>
                  </div>
                </div>

                {/* Model/Color Groups */}
                <div className="space-y-4">
                  {Object.entries(loadedPhaseDetails[selectedPhase].model_color_groups).map(([key, group]: any) => (
                    <details key={key} className="group">
                      <summary className={`p-3 rounded-lg border cursor-pointer hover:bg-opacity-80 transition-all duration-200 list-none ${
                        group.second_degree_sizes.length > 0
                          ? 'bg-red-50 border-red-200 hover:bg-red-100'
                          : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                      }`}>
                        {/* Enhanced Group Header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div>
                              <h3 className="text-sm font-semibold">
                                <span className="text-blue-700">{group.model_name}</span>
                                <span className="text-gray-500 mx-1">-</span>
                                <span className="text-purple-700">{group.color_name}</span>
                              </h3>
                              {group.second_degree_sizes.length > 0 && (
                                <span className="text-xs bg-red-100 text-red-800 px-1.5 py-0.5 rounded-full">
                                  2nd Degree
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <div className="text-sm font-bold text-green-700">
                                Qty: {group.total_quantity}
                                {group.expected_quantity > 0 ? `/${group.expected_quantity}` : ''}
                              </div>
                              <div className="text-sm font-bold text-orange-600">
                                Time: {group.time_in_phase}
                              </div>
                            </div>
                            <div className="flex items-center justify-center w-6 h-6">
                              <svg className="w-4 h-4 text-gray-500 group-open:rotate-180 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
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
                            <h4 className="text-sm font-medium text-gray-700 mb-2">Regular Items</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                              {group.sizes.map((size: any, index: number) => (
                                <div key={`regular-${index}`} className="p-4 bg-white rounded-lg border border-gray-200">
                                  <div className="text-center">
                                    <div className="text-sm font-bold text-blue-700">Size {size.size_value}</div>
                                    <div className="text-lg font-bold text-gray-900 mt-1">
                                      {size.quantity}
                                      {size.expected_quantity > 0 && (
                                        <span className="text-sm font-normal text-gray-500">
                                          /{size.expected_quantity}
                                        </span>
                                      )}
                                    </div>
                                    {size.expected_quantity > 0 && (
                                      <div className={`text-xs ${
                                        size.quantity >= size.expected_quantity ? 'text-green-600' : 'text-orange-600'
                                      }`}>
                                        ({Math.round((size.quantity / size.expected_quantity) * 100)}%)
                                      </div>
                                    )}
                                    <div className="text-xs text-gray-500 mt-1">
                                      {size.batch_count} batch{size.batch_count > 1 ? 'es' : ''}
                                    </div>
                                    <div className="text-xs text-gray-600 mt-2">
                                      Time: {size.time_in_phase}
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
                            <h4 className="text-sm font-medium text-red-700 mb-2">Second Degree Items</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                              {group.second_degree_sizes.map((size: any, index: number) => (
                                <div key={`second-degree-${index}`} className="p-4 bg-red-50 rounded-lg border-2 border-red-200">
                                  <div className="text-center">
                                    <div className="text-sm font-bold text-red-700">Size {size.size_value}</div>
                                    <div className="text-lg font-bold text-red-900 mt-1">
                                      {size.quantity}
                                      {size.expected_quantity > 0 && (
                                        <span className="text-sm font-normal text-red-500">
                                          /{size.expected_quantity}
                                        </span>
                                      )}
                                    </div>
                                    {size.expected_quantity > 0 && (
                                      <div className={`text-xs ${
                                        size.quantity >= size.expected_quantity ? 'text-green-600' : 'text-orange-600'
                                      }`}>
                                        ({Math.round((size.quantity / size.expected_quantity) * 100)}%)
                                      </div>
                                    )}
                                    <div className="text-xs text-red-500 mt-1">
                                      {size.batch_count} batch{size.batch_count > 1 ? 'es' : ''}
                                    </div>
                                    <div className="text-xs text-red-600 mt-2">
                                      Time: {size.time_in_phase}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            )}

            {/* No Phase Selected */}
            {!selectedPhase && (
              <div className="text-center py-12 text-gray-500">
                <Activity className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p className="text-lg font-medium">Select a phase to view details</p>
                <p className="text-sm">Click on any phase tab above to load its detailed information</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ProductionPhasesOverview;