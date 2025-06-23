import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, Legend, CartesianGrid } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AdvancedStatisticsResponse } from '@/services/api';
import api from '@/services/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Search, ChevronDown, X } from 'lucide-react';

const AdvancedStatisticsPage: React.FC = () => {
  const [data, setData] = useState<AdvancedStatisticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentBrandIndex, setCurrentBrandIndex] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentModelIndex, setCurrentModelIndex] = useState(0);
  const [modelSearchTerm, setModelSearchTerm] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    // Use the API service instead of direct fetch
    api.get('/statistics/advanced')
      .then((response) => {
        setData(response.data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // Reset current brand index when search term changes
  useEffect(() => {
    setCurrentBrandIndex(0);
  }, [searchTerm]);

  // Reset current model index when model search term changes
  useEffect(() => {
    setCurrentModelIndex(0);
  }, [modelSearchTerm]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.dropdown-container')) {
        setShowBrandDropdown(false);
        setShowModelDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Transform data for better chart visualization
  const getChartData = () => {
    if (!data) return [];
    
    const brandPhaseData = data.working_phase_by_brand.filter(item => item.total > 0);
    const brands = [...new Set(brandPhaseData.map(item => item.brand_name))];
    const phases = [...new Set(brandPhaseData.map(item => item.phase_name))];
    
    return brands.map(brand => {
      const brandData: any = { brand };
      phases.forEach(phase => {
        const phaseData = brandPhaseData.find(item => item.brand_name === brand && item.phase_name === phase);
        if (phaseData) {
          brandData[`${phase}_pending`] = phaseData.pending;
          brandData[`${phase}_in_progress`] = phaseData.in_progress;
          brandData[`${phase}_completed`] = phaseData.completed;
          brandData[`${phase}_total`] = phaseData.total;
        } else {
          brandData[`${phase}_pending`] = 0;
          brandData[`${phase}_in_progress`] = 0;
          brandData[`${phase}_completed`] = 0;
          brandData[`${phase}_total`] = 0;
        }
      });
      return brandData;
    });
  };

  // Get filtered and searchable brands
  const getFilteredBrands = () => {
    if (!data) return [];
    const brandPhaseData = data.working_phase_by_brand.filter(item => item.total > 0);
    const brands = [...new Set(brandPhaseData.map(item => item.brand_name))];
    
    if (!searchTerm) return brands;
    
    return brands.filter(brand => 
      brand.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  // Get filtered and searchable models
  const getFilteredModels = () => {
    if (!data) return [];
    const modelPhaseData = data.working_phase_by_model.filter(item => item.total > 0);
    
    // Get unique model-brand combinations
    const modelBrandMap = new Map<string, string>();
    modelPhaseData.forEach(item => {
      modelBrandMap.set(item.model_name, item.brand_name);
    });
    
    const models = [...new Set(modelPhaseData.map(item => item.model_name))];
    
    if (!modelSearchTerm) return models.map(model => ({
      modelName: model,
      brandName: modelBrandMap.get(model) || 'Unknown Brand'
    }));
    
    return models
      .filter(model => 
        model.toLowerCase().includes(modelSearchTerm.toLowerCase()) ||
        (modelBrandMap.get(model) || '').toLowerCase().includes(modelSearchTerm.toLowerCase())
      )
      .map(model => ({
        modelName: model,
        brandName: modelBrandMap.get(model) || 'Unknown Brand'
      }));
  };

  // Get current brand data
  const getCurrentBrandData = () => {
    if (!data || !selectedBrand) return null;
    
    const brandData = data.working_phase_by_brand.filter(
      item => item.brand_name === selectedBrand
    );
    
    return {
      brandName: selectedBrand,
      phases: brandData.map(item => ({
        phaseName: item.phase_name,
        pending: item.pending,
        inProgress: item.in_progress,
        completed: item.completed,
        total: item.total
      }))
    };
  };

  // Get current model data
  const getCurrentModelData = () => {
    if (!data || !selectedModel) return null;
    
    const modelData = data.working_phase_by_model.filter(
      item => item.model_name === selectedModel
    );
    
    return {
      modelName: selectedModel,
      phases: modelData.map(item => ({
        phaseName: item.phase_name,
        pending: item.pending,
        inProgress: item.in_progress,
        completed: item.completed,
        total: item.total
      }))
    };
  };

  // Get stalled brands by phase
  const getStalledBrandsByPhase = () => {
    if (!data) return [];
    
    const phaseStalledBrands = [];
    const phases = ['Cutting', 'Sewing', 'Packaging'];
    
    phases.forEach(phaseName => {
      const phaseData = data.working_phase_by_brand.filter(
        item => item.phase_name === phaseName && item.pending > 0
      );
      
      if (phaseData.length > 0) {
        const topStalled = phaseData
          .sort((a, b) => b.pending - a.pending)
          .slice(0, 3); // Top 3 most pending
        
        phaseStalledBrands.push({
          phase: phaseName,
          brands: topStalled.map(item => ({
            brandName: item.brand_name,
            pending: item.pending,
            inProgress: item.in_progress,
            total: item.total
          }))
        });
      }
    });
    
    return phaseStalledBrands;
  };

  // Get most pending brands overall
  const getMostPendingBrands = () => {
    if (!data) return [];
    
    const brandTotals = new Map<string, { pending: number; inProgress: number; total: number }>();
    
    data.working_phase_by_brand.forEach(item => {
      const existing = brandTotals.get(item.brand_name) || { pending: 0, inProgress: 0, total: 0 };
      brandTotals.set(item.brand_name, {
        pending: existing.pending + item.pending,
        inProgress: existing.inProgress + item.in_progress,
        total: existing.total + item.total
      });
    });
    
    return Array.from(brandTotals.entries())
      .filter(([_, stats]) => stats.pending > 0)
      .sort(([_, a], [__, b]) => b.pending - a.pending)
      .slice(0, 5) // Top 5 most pending
      .map(([brandName, stats]) => ({
        brandName,
        pending: stats.pending,
        inProgress: stats.inProgress,
        total: stats.total
      }));
  };

  if (loading) return <div className="p-6">Loading advanced statistics...</div>;
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;
  if (!data) return <div className="p-6">No data available.</div>;

  const PIE_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];
  const chartData = getChartData();

  return (
    <Layout>
      <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
        <h1 className="text-3xl font-bold text-gray-800">Advanced Production Statistics</h1>

        {/* Brand Statistics Dashboard */}
        <div className="grid grid-cols-1 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Brand Statistics Dashboard</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Search Bar */}
              <div className="relative mb-6 dropdown-container">
                <div className="relative">
                  <Input
                    type="text"
                    placeholder="Search brands..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setShowBrandDropdown(true);
                    }}
                    onFocus={() => setShowBrandDropdown(true)}
                    className="pr-10"
                  />
                  <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center space-x-1">
                    {selectedBrand && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedBrand(null);
                          setSearchTerm('');
                        }}
                        className="h-6 w-6 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  </div>
                </div>
                
                {/* Dropdown */}
                {showBrandDropdown && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
                    {getFilteredBrands().length > 0 ? (
                      getFilteredBrands().map((brand) => (
                        <div
                          key={brand}
                          className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                          onClick={() => {
                            setSelectedBrand(brand);
                            setSearchTerm(brand);
                            setShowBrandDropdown(false);
                          }}
                        >
                          {brand}
                        </div>
                      ))
                    ) : (
                      <div className="px-4 py-2 text-gray-500">No brands found</div>
                    )}
                  </div>
                )}
              </div>

              {/* Selected Brand Display */}
              {selectedBrand && (
                <div className="mb-6 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-blue-800">{selectedBrand}</h3>
                      <p className="text-sm text-blue-600">Brand Statistics</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedBrand(null);
                        setSearchTerm('');
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Brand Statistics Cards */}
              {getCurrentBrandData() && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {getCurrentBrandData()!.phases
                    .sort((a, b) => {
                      // Custom sorting: Cutting, Sewing, Packaging
                      const order = { 'Cutting': 1, 'Sewing': 2, 'Packaging': 3 };
                      return (order[a.phaseName as keyof typeof order] || 0) - (order[b.phaseName as keyof typeof order] || 0);
                    })
                    .map((phase) => (
                    <Card key={phase.phaseName} className="border-l-4 border-l-blue-500">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex items-center justify-between">
                          <span>{phase.phaseName}</span>
                          <span className="text-2xl font-bold text-blue-600">
                            {phase.total}
                          </span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Pending</span>
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              {phase.pending}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">In Progress</span>
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              {phase.inProgress}
                            </span>
                          </div>
                          {phase.phaseName === 'Packaging' && (
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-gray-600">Completed</span>
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                {phase.completed}
                              </span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Universal Progress Bar */}
              {getCurrentBrandData() && (
                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="text-lg font-semibold text-gray-800">Overall Production Progress</h4>
                    <span className="text-sm font-medium text-gray-600">
                      {(() => {
                        const phases = getCurrentBrandData()!.phases;
                        const totalCompleted = phases.reduce((sum, phase) => sum + (phase.phaseName === 'Packaging' ? phase.completed : 0), 0);
                        const totalBatches = phases.reduce((sum, phase) => sum + phase.total, 0);
                        return totalBatches > 0 ? Math.round((totalCompleted / totalBatches) * 100) : 0;
                      })()}% Complete
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                    <div 
                      className="h-3 rounded-full transition-all duration-300"
                      style={{ 
                        width: `${(() => {
                          const phases = getCurrentBrandData()!.phases;
                          const totalCompleted = phases.reduce((sum, phase) => sum + (phase.phaseName === 'Packaging' ? phase.completed : 0), 0);
                          const totalBatches = phases.reduce((sum, phase) => sum + phase.total, 0);
                          return totalBatches > 0 ? (totalCompleted / totalBatches) * 100 : 0;
                        })()}%`,
                        background: `linear-gradient(90deg, #10b981 0%, #059669 100%)`
                      }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Total Completed: {getCurrentBrandData()!.phases.reduce((sum, phase) => sum + (phase.phaseName === 'Packaging' ? phase.completed : 0), 0)}</span>
                    <span>Total Batches: {getCurrentBrandData()!.phases.reduce((sum, phase) => sum + phase.total, 0)}</span>
                  </div>
                </div>
              )}

              {/* No Selection Message */}
              {!selectedBrand && (
                <div className="text-center py-8">
                  <p className="text-gray-500">Search and select a brand to view statistics.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Model Statistics Dashboard */}
        <div className="grid grid-cols-1 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Model Statistics Dashboard</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Search Bar */}
              <div className="relative mb-6 dropdown-container">
                <div className="relative">
                  <Input
                    type="text"
                    placeholder="Search models..."
                    value={modelSearchTerm}
                    onChange={(e) => {
                      setModelSearchTerm(e.target.value);
                      setShowModelDropdown(true);
                    }}
                    onFocus={() => setShowModelDropdown(true)}
                    className="pr-10"
                  />
                  <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center space-x-1">
                    {selectedModel && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedModel(null);
                          setModelSearchTerm('');
                        }}
                        className="h-6 w-6 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  </div>
                </div>
                
                {/* Dropdown */}
                {showModelDropdown && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
                    {getFilteredModels().length > 0 ? (
                      getFilteredModels().map((model) => (
                        <div
                          key={model.modelName}
                          className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                          onClick={() => {
                            setSelectedModel(model.modelName);
                            setModelSearchTerm(model.modelName);
                            setShowModelDropdown(false);
                          }}
                        >
                          {model.modelName} - {model.brandName}
                        </div>
                      ))
                    ) : (
                      <div className="px-4 py-2 text-gray-500">No models found</div>
                    )}
                  </div>
                )}
              </div>

              {/* Selected Model Display */}
              {selectedModel && (
                <div className="mb-6 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-purple-800">{selectedModel}</h3>
                      <p className="text-sm text-purple-600">Model Statistics</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedModel(null);
                        setModelSearchTerm('');
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Model Statistics Cards */}
              {getCurrentModelData() && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {getCurrentModelData()!.phases
                    .sort((a, b) => {
                      // Custom sorting: Cutting, Sewing, Packaging
                      const order = { 'Cutting': 1, 'Sewing': 2, 'Packaging': 3 };
                      return (order[a.phaseName as keyof typeof order] || 0) - (order[b.phaseName as keyof typeof order] || 0);
                    })
                    .map((phase) => (
                    <Card key={phase.phaseName} className="border-l-4 border-l-purple-500">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex items-center justify-between">
                          <span>{phase.phaseName}</span>
                          <span className="text-2xl font-bold text-purple-600">
                            {phase.total}
                          </span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Pending</span>
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              {phase.pending}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">In Progress</span>
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              {phase.inProgress}
                            </span>
                          </div>
                          {phase.phaseName === 'Packaging' && (
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-gray-600">Completed</span>
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                {phase.completed}
                              </span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Universal Progress Bar */}
              {getCurrentModelData() && (
                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="text-lg font-semibold text-gray-800">Overall Production Progress</h4>
                    <span className="text-sm font-medium text-gray-600">
                      {(() => {
                        const phases = getCurrentModelData()!.phases;
                        const totalCompleted = phases.reduce((sum, phase) => sum + (phase.phaseName === 'Packaging' ? phase.completed : 0), 0);
                        const totalBatches = phases.reduce((sum, phase) => sum + phase.total, 0);
                        return totalBatches > 0 ? Math.round((totalCompleted / totalBatches) * 100) : 0;
                      })()}% Complete
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                    <div 
                      className="h-3 rounded-full transition-all duration-300"
                      style={{ 
                        width: `${(() => {
                          const phases = getCurrentModelData()!.phases;
                          const totalCompleted = phases.reduce((sum, phase) => sum + (phase.phaseName === 'Packaging' ? phase.completed : 0), 0);
                          const totalBatches = phases.reduce((sum, phase) => sum + phase.total, 0);
                          return totalBatches > 0 ? (totalCompleted / totalBatches) * 100 : 0;
                        })()}%`,
                        background: `linear-gradient(90deg, #10b981 0%, #059669 100%)`
                      }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Total Completed: {getCurrentModelData()!.phases.reduce((sum, phase) => sum + (phase.phaseName === 'Packaging' ? phase.completed : 0), 0)}</span>
                    <span>Total Batches: {getCurrentModelData()!.phases.reduce((sum, phase) => sum + phase.total, 0)}</span>
                  </div>
                </div>
              )}

              {/* No Results Message */}
              {getFilteredModels().length === 0 && (
                <div className="text-center py-8">
                  <p className="text-gray-500">No models found matching your search.</p>
                </div>
              )}

              {/* No Selection Message */}
              {!selectedModel && (
                <div className="text-center py-8">
                  <p className="text-gray-500">Search and select a model to view statistics.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Concise Stalled Models Row (Larger) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Most Pending Models Overall */}
          <Card className="py-4 px-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-purple-600 font-bold">Most Pending Models</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(() => {
                if (!data) return null;
                // Aggregate pending by model
                const modelTotals = new Map<string, { pending: number; brand: string }>();
                data.working_phase_by_model.forEach(item => {
                  const existing = modelTotals.get(item.model_name) || { pending: 0, brand: item.brand_name };
                  modelTotals.set(item.model_name, {
                    pending: existing.pending + item.pending,
                    brand: item.brand_name
                  });
                });
                return Array.from(modelTotals.entries())
                  .filter(([_, stats]) => stats.pending > 0)
                  .sort(([_, a], [__, b]) => b.pending - a.pending)
                  .slice(0, 3)
                  .map(([modelName, stats], index) => (
                    <div key={modelName} className="flex items-center justify-between py-2">
                      <span className="truncate font-semibold text-sm">{index + 1}. {modelName} <span className="text-gray-400">({stats.brand})</span></span>
                      <span className="font-bold text-lg text-purple-600">{stats.pending}</span>
                    </div>
                  ));
              })()}
            </CardContent>
          </Card>
          {/* Most Pending in Cutting */}
          <Card className="py-4 px-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-blue-600 font-bold">Most Pending in Cutting</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(() => {
                if (!data) return null;
                const cutting = data.working_phase_by_model.filter(item => item.phase_name === 'Cutting' && item.pending > 0);
                return cutting
                  .sort((a, b) => b.pending - a.pending)
                  .slice(0, 3)
                  .map((item, index) => (
                    <div key={item.model_name} className="flex items-center justify-between py-2">
                      <span className="truncate font-semibold text-sm">{index + 1}. {item.model_name} <span className="text-gray-400">({item.brand_name})</span></span>
                      <span className="font-bold text-lg text-blue-600">{item.pending}</span>
                    </div>
                  ));
              })()}
              {data && data.working_phase_by_model.filter(item => item.phase_name === 'Cutting' && item.pending > 0).length === 0 && (
                <div className="text-center text-gray-400 text-sm py-3">No pending</div>
              )}
            </CardContent>
          </Card>
          {/* Most Pending in Sewing */}
          <Card className="py-4 px-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-purple-600 font-bold">Most Pending in Sewing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(() => {
                if (!data) return null;
                const sewing = data.working_phase_by_model.filter(item => item.phase_name === 'Sewing' && item.pending > 0);
                return sewing
                  .sort((a, b) => b.pending - a.pending)
                  .slice(0, 3)
                  .map((item, index) => (
                    <div key={item.model_name} className="flex items-center justify-between py-2">
                      <span className="truncate font-semibold text-sm">{index + 1}. {item.model_name} <span className="text-gray-400">({item.brand_name})</span></span>
                      <span className="font-bold text-lg text-purple-600">{item.pending}</span>
                    </div>
                  ));
              })()}
              {data && data.working_phase_by_model.filter(item => item.phase_name === 'Sewing' && item.pending > 0).length === 0 && (
                <div className="text-center text-gray-400 text-sm py-3">No pending</div>
              )}
            </CardContent>
          </Card>
          {/* Most Pending in Packaging */}
          <Card className="py-4 px-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-orange-600 font-bold">Most Pending in Packaging</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(() => {
                if (!data) return null;
                const packaging = data.working_phase_by_model.filter(item => item.phase_name === 'Packaging' && item.pending > 0);
                return packaging
                  .sort((a, b) => b.pending - a.pending)
                  .slice(0, 3)
                  .map((item, index) => (
                    <div key={item.model_name} className="flex items-center justify-between py-2">
                      <span className="truncate font-semibold text-sm">{index + 1}. {item.model_name} <span className="text-gray-400">({item.brand_name})</span></span>
                      <span className="font-bold text-lg text-orange-600">{item.pending}</span>
                    </div>
                  ));
              })()}
              {data && data.working_phase_by_model.filter(item => item.phase_name === 'Packaging' && item.pending > 0).length === 0 && (
                <div className="text-center text-gray-400 text-sm py-3">No pending</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* KPI + Turnover Rate by Phase Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Stacked Turnover Cards */}
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Slowest Turnover</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600">{data.slowest_turnover?.average_minutes.toFixed(2)} min</div>
              <p className="text-sm text-gray-500 mt-1">in</p>
              <div className="text-xl font-semibold text-gray-800 mt-1">{data.slowest_turnover?.phase_name || 'N/A'}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Fastest Turnover</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{data.fastest_turnover?.average_minutes.toFixed(2)} min</div>
              <p className="text-sm text-gray-500 mt-1">in</p>
              <div className="text-xl font-semibold text-gray-800 mt-1">{data.fastest_turnover?.phase_name || 'N/A'}</div>
            </CardContent>
          </Card>
        </div>
          {/* Turnover Rate by Phase Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Turnover Rate by Phase (Avg. Minutes)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.turnover_rate_by_phase}>
                  <XAxis dataKey="phase_name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="average_minutes" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
        
        {/* WIP and Batch Status Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Work in Progress by Phase Table */}
          <Card>
            <CardHeader>
              <CardTitle>Work in Progress by Phase</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Phase</TableHead>
                    <TableHead>Pending</TableHead>
                    <TableHead>In Progress</TableHead>
                    <TableHead>Completed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.current_wip.map((item) => (
                    <TableRow key={item.phase_id}>
                      <TableCell>{item.phase_name}</TableCell>
                      <TableCell>{item.pending}</TableCell>
                      <TableCell>{item.in_progress}</TableCell>
                      <TableCell>{item.completed}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          {/* Batch Status Distribution Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Batch Status Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={data.status_distribution} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={100} fill="#8884d8" label>
                    {data.status_distribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default AdvancedStatisticsPage; 