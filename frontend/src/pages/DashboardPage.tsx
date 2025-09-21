import React, { useEffect, useState, useCallback } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { barcodeApi, BatchStats, PhaseStats, BarcodeData, jobOrderApi, JobOrderSummary } from '@/services/api';
import { Link } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import SearchableDropdown from '@/components/SearchableDropdown';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import HandleMonitor from '@/components/HandleMonitor';


const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [stats, setStats] = useState<BatchStats>({
    total_batches: 0,
    in_production: 0,
    completed: 0
  });

  const [phaseStats, setPhaseStats] = useState<PhaseStats>({
    cutting: {
      pending: 0,
      in_progress: 0
    },
    sewing: {
      pending: 0,
      in_progress: 0
    },
    packaging: {
      completed: 0,
      pending: 0,
      in_progress: 0
    }
  });

  const [phaseBarcodes, setPhaseBarcodes] = useState<{
    [key: string]: {
      pending: BarcodeData[];
      in_progress: BarcodeData[];
    }
  }>({
    cutting: { pending: [], in_progress: [] },
    sewing: { pending: [], in_progress: [] },
    packaging: { pending: [], in_progress: [] }
  });

  const [jobOrderSummaries, setJobOrderSummaries] = useState<JobOrderSummary[]>([]);
  const [loadingJobOrders, setLoadingJobOrders] = useState<boolean>(false);
  const [jobOrdersTotal, setJobOrdersTotal] = useState<number>(0);
  const [jobOrdersSkip, setJobOrdersSkip] = useState<number>(0);
  const jobOrdersLimit = 50;
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [joFilters, setJoFilters] = useState<{ job_order_number: string; model_name: string; brand_name: string }>({
    job_order_number: '',
    model_name: '',
    brand_name: ''
  });
  const [brandOptions, setBrandOptions] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'job-orders' | 'pending' | 'in-progress'>('pending');
  const [loadedTabs, setLoadedTabs] = useState<Set<string>>(new Set(['pending']));
  
  // Track if this is the initial page load
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  
  // Search filters for pending and in-progress items
  const [itemFilters, setItemFilters] = useState<{
    job_order_number: string;
    model_name: string;
    brand_name: string;
  }>({
    job_order_number: '',
    model_name: '',
    brand_name: ''
  });

  const [expectedQuantities, setExpectedQuantities] = useState<{[key: string]: number}>({});
  const [jobOrderExpectedTotals, setJobOrderExpectedTotals] = useState<{[jobOrderId: number]: number}>({});
  const [colorExpectedTotals, setColorExpectedTotals] = useState<{[key: string]: number}>({});

  const hasMoreJobOrders = jobOrderSummaries.length < jobOrdersTotal;

  const fetchJobOrders = useCallback(async (reset: boolean = false, forceRefresh: boolean = false) => {
    if (reset) {
      setLoadingJobOrders(true);
    } else {
      setIsLoadingMore(true);
    }
    try {
      // If force refresh is requested, refresh the summary data first
      if (forceRefresh) {
        try {
          await jobOrderApi.refreshItemSummaries();
        } catch (refreshError) {
          console.warn('Failed to refresh summary data:', refreshError);
          // Continue with fetching even if refresh fails
        }
      }
      
      const params: {
        skip: number;
        limit: number;
        job_order_number?: string;
        model_name?: string;
        brand_name?: string;
      } = {
        skip: reset ? 0 : jobOrdersSkip,
        limit: jobOrdersLimit,
        ...Object.fromEntries(Object.entries(joFilters).filter(([_, v]) => v !== '')),
      };
      const { items, total } = await jobOrderApi.getSummary(params);
      setJobOrdersTotal(total);
      if (reset) {
        setJobOrderSummaries(items);
        setJobOrdersSkip(items.length);
      } else {
        setJobOrderSummaries(prev => [...prev, ...items]);
        setJobOrdersSkip(prev => prev + items.length);
      }
    } catch (e) {
      console.error('Error fetching job orders:', e);
    } finally {
      if (reset) {
        setLoadingJobOrders(false);
      } else {
        setIsLoadingMore(false);
      }
    }
  }, [joFilters, jobOrdersSkip, jobOrdersLimit]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [batchStats, phaseData] = await Promise.all([
          barcodeApi.getBatchStats(),
          barcodeApi.getPhaseStats()
        ]);

        setStats(batchStats);
        setPhaseStats(phaseData);

        // Fetch barcodes for department if user is not admin; aggregate across multi-line phases like Sewing-1, Sewing-2
        if (user && user.role !== 'Admin' && user.role !== 'Creator') {
          const roleName = user.role; // e.g., 'Sewing'
          let targetPhaseNames: string[] = [roleName];
          try {
            const phases = await barcodeApi.getPhases();
            const lowerRole = roleName.toLowerCase();
            // Collect all phases starting with the role prefix (e.g., sewing, cutting, packaging)
            const matched = phases
              .map(p => p.phase_name)
              .filter(name => name && name.toLowerCase().startsWith(lowerRole));
            if (matched.length > 0) {
              targetPhaseNames = matched;
            }
          } catch (e) {
            console.error('Error fetching phases:', e);
          }

          const pendingAll: BarcodeData[] = [];
          const inProgressAll: BarcodeData[] = [];
          
          // Helper function to fetch all barcodes for a phase and status
          const fetchAllBarcodesForPhase = async (phaseName: string, status: string) => {
            const allBarcodes: BarcodeData[] = [];
            let skip = 0;
            const limit = 100;
            
            while (true) {
              const response = await barcodeApi.getBarcodes({
                phase: phaseName,
                status: status,
                skip: skip,
                limit: limit
              });
              
              allBarcodes.push(...response.items);
              
              // If we got fewer items than the limit, we've reached the end
              if (response.items.length < limit) {
                break;
              }
              
              skip += limit;
            }
            
            return allBarcodes;
          };
          
          await Promise.all(
            targetPhaseNames.map(async (phaseName) => {
              const [pendingBarcodes, inProgressBarcodes] = await Promise.all([
                fetchAllBarcodesForPhase(phaseName, 'Pending'),
                fetchAllBarcodesForPhase(phaseName, 'In Progress')
              ]);
              pendingAll.push(...pendingBarcodes);
              inProgressAll.push(...inProgressBarcodes);
            })
          );

          setPhaseBarcodes(prev => ({
            ...prev,
            [roleName.toLowerCase()]: {
              pending: pendingAll,
              in_progress: inProgressAll
            }
          }));
        }

        // For non-admin users, fetch job order summaries (limited)
        if (user && user.role !== 'Admin') {
          // Only auto-refresh on initial page load
          const shouldRefresh = isInitialLoad;
          fetchJobOrders(true, shouldRefresh);
          if (isInitialLoad) {
            setIsInitialLoad(false);
          }
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      }
    };

    fetchData();
  }, [user]);

  // Refetch when filters change
  useEffect(() => {
    if (user && user.role !== 'Admin') {
      setJobOrdersSkip(0);
      // Don't refresh on filter changes, only on initial load
      fetchJobOrders(true, false);
    }
  }, [joFilters.job_order_number, joFilters.model_name, joFilters.brand_name, user]);

  // Fetch brand options for dropdown
  useEffect(() => {
    const fetchBrands = async () => {
      try {
        const simple = await jobOrderApi.getAllSimple();
        const brands = [...new Set(simple.map(s => s.brand_name).filter(Boolean))] as string[];
        setBrandOptions(brands);
      } catch (e) {
        setBrandOptions([]);
      }
    };
    fetchBrands();
  }, []);

  // Fetch expected quantities when phase barcodes change
  useEffect(() => {
    const fetchExpectedQuantities = async () => {
      const quantities: {[key: string]: number} = {};
      const jobOrderTotals: {[jobOrderId: number]: number} = {};
      const colorTotals: {[key: string]: number} = {};
      
      // Get all unique job order IDs from phase barcodes
      const allJobOrderIds = new Set<number>();
      Object.values(phaseBarcodes).forEach(phaseData => {
        phaseData.pending.forEach(b => allJobOrderIds.add(b.job_order_id));
        phaseData.in_progress.forEach(b => allJobOrderIds.add(b.job_order_id));
      });
      
      for (const jobOrderId of allJobOrderIds) {
        try {
          const response = await jobOrderApi.getItemsWithDetails(jobOrderId);
          let jobOrderTotal = 0;
          
          response.forEach(item => {
            const key = `${jobOrderId}-${item.color_id}-${item.size_id}`;
            quantities[key] = item.quantity;
            
            // Calculate job order total (all items)
            jobOrderTotal += item.quantity;
            
            // Calculate color total (all sizes for this color)
            const colorKey = `${jobOrderId}-${item.color_id}`;
            if (!colorTotals[colorKey]) {
              colorTotals[colorKey] = 0;
            }
            colorTotals[colorKey] += item.quantity;
          });
          
          jobOrderTotals[jobOrderId] = jobOrderTotal;
        } catch (error) {
          console.error(`Error fetching expected quantities for job order ${jobOrderId}:`, error);
        }
      }
      
      setExpectedQuantities(quantities);
      setJobOrderExpectedTotals(jobOrderTotals);
      setColorExpectedTotals(colorTotals);
    };
    
    if (Object.keys(phaseBarcodes).length > 0) {
      fetchExpectedQuantities();
    }
  }, [phaseBarcodes]);



  // Helper function to safely get phase data
  const getPhaseStats = (phaseKey: string) => {
    return phaseStats[phaseKey as keyof PhaseStats];
  };

  // Phase configuration with proper ordering and colors
  const phaseConfig = [
    { key: 'cutting', name: t('phases.cutting'), color: 'rgb(30 64 175)' },
    { key: 'sewing', name: t('phases.sewing'), color: 'rgb(107 33 168)' },
    { key: 'packaging', name: t('phases.packaging'), color: 'rgb(154 52 18)' }
  ];

  // Overall production phase data - dynamically generated based on phase stats
  const productionPhaseData = [
    ...phaseConfig.map(phase => {
      const phaseData = getPhaseStats(phase.key);
      
      // For packaging, include completed items since it's the final phase
      let count;
      if (phase.key === 'packaging') {
        const packagingData = phaseData as PhaseStats['packaging'];
        count = packagingData.pending + packagingData.in_progress + packagingData.completed;
      } else {
        count = phaseData.pending + phaseData.in_progress;
      }
      
      return {
        phase: phase.name,
        count: count,
        color: phase.color
      };
    }),
    { phase: t('phases.completed'), count: phaseStats.packaging.completed, color: '#90EE90' } // light green
  ];

  // Generate individual phase data dynamically
  const getPhaseData = (phaseKey: string, phaseColor: string) => {
    const phaseData = getPhaseStats(phaseKey);
    // All phases (cutting, sewing, packaging) only show pending and in_progress
    return [
      { status: t('status.pending'), count: phaseData.pending, color: phaseColor },
      { status: t('status.inProgress'), count: phaseData.in_progress, color: phaseColor }
    ];
  };



  const renderCustomLabel = (props: {
    x: number;
    y: number;
    width: number;
    height: number;
    value: number;
  }) => {
    const { x, y, width, height, value } = props;
    const barHeight = height;
    
    // Don't render label if value is 0 or bar height is 0
    if (value === 0 || barHeight === 0) {
      return null;
    }
    
    // If bar height is less than 40px, show label above, otherwise inside
    const labelY = barHeight < 40 ? y - 8 : y + height / 2;
    const textAnchor = 'middle';
    const fill = barHeight < 40 ? '#374151' : '#ffffff'; // Dark gray above, white inside
    const fontSize = Math.min(16, Math.max(12, width / 8)); // Responsive font size
    const fontWeight = 'bold'; // Make text bold

    return (
      <text
        x={x + width / 2}
        y={labelY}
        fill={fill}
        textAnchor={textAnchor}
        dominantBaseline="middle"
        fontSize={fontSize}
        fontWeight={fontWeight}
        style={{ textShadow: barHeight < 40 ? 'none' : '0 0 2px rgba(0,0,0,0.5)' }} // Add shadow for better contrast when inside bar
      >
        {value}
      </text>
    );
  };

  const renderAggregatedItemList = (barcodes: BarcodeData[], title: string) => {
    // Filter barcodes based on search criteria
    const filteredBarcodes = barcodes.filter(b => {
      const matchesJobOrder = !itemFilters.job_order_number || 
        (b.job_order_number && b.job_order_number.toLowerCase().includes(itemFilters.job_order_number.toLowerCase()));
      const matchesModel = !itemFilters.model_name || 
        (b.model_name && b.model_name.toLowerCase().includes(itemFilters.model_name.toLowerCase()));
      const matchesBrand = !itemFilters.brand_name || 
        (b.brand_name && b.brand_name.toLowerCase().includes(itemFilters.brand_name.toLowerCase()));
      
      return matchesJobOrder && matchesModel && matchesBrand;
    });

    // Get unique job order IDs from filtered barcodes
    const jobOrderIds = [...new Set(filteredBarcodes.map(b => b.job_order_id))];

    // Group by job order, then color, then size
    const groupedData = new Map<string, {
      job_order_id: number;
      job_order_number?: string;
      brand_name: string;
      model_name: string;
      total_quantity: number;
      expected_quantity: number;
      colors: Map<string, {
        color_name: string;
        color_id: number;
        total_quantity: number;
        expected_quantity: number;
        sizes: Map<string, {
          size_value: string;
          total_quantity: number;
          expected_quantity: number;
        }>;
      }>;
    }>();

    filteredBarcodes.forEach(b => {
      const jobOrderKey = `${b.job_order_id}`;
      
      if (!groupedData.has(jobOrderKey)) {
        groupedData.set(jobOrderKey, {
          job_order_id: b.job_order_id,
          job_order_number: b.job_order_number,
          brand_name: b.brand_name,
          model_name: b.model_name,
          total_quantity: 0,
          expected_quantity: 0,
          colors: new Map()
        });
      }
      
      const jobOrder = groupedData.get(jobOrderKey)!;
      jobOrder.total_quantity += b.quantity;
      
      if (!jobOrder.colors.has(b.color_name)) {
        jobOrder.colors.set(b.color_name, {
          color_name: b.color_name,
          color_id: b.color_id,
          total_quantity: 0,
          expected_quantity: 0,
          sizes: new Map()
        });
      }
      
      const color = jobOrder.colors.get(b.color_name)!;
      color.total_quantity += b.quantity;
      
      if (!color.sizes.has(b.size_value)) {
        color.sizes.set(b.size_value, {
          size_value: b.size_value,
          total_quantity: 0,
          expected_quantity: 0
        });
      }
      
      const size = color.sizes.get(b.size_value)!;
      size.total_quantity += b.quantity;
      
      // Get expected quantity from the fetched data (only set once per size)
      if (size.expected_quantity === 0) {
        const expectedKey = `${b.job_order_id}-${b.color_id}-${b.size_id}`;
        const expectedQty = expectedQuantities[expectedKey] || 0;
        size.expected_quantity = expectedQty;
      }
    });

    // Set static expected quantities for colors and job orders from complete data
    groupedData.forEach(jobOrder => {
      // Set job order expected quantity from complete job order data
      jobOrder.expected_quantity = jobOrderExpectedTotals[jobOrder.job_order_id] || 0;
      
      // Set color expected quantities from complete color data
      jobOrder.colors.forEach(color => {
        const colorKey = `${jobOrder.job_order_id}-${color.color_id}`;
        color.expected_quantity = colorExpectedTotals[colorKey] || 0;
      });
    });

    return (
      <Card className="flex-1 flex flex-col min-h-0 h-full">
        <CardHeader className="flex-shrink-0">
          <CardTitle className="text-lg font-medium">{title}</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto min-h-0">
            {Array.from(groupedData.values()).length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-gray-500 py-8">
                {t('dashboard.noItems')}
              </div>
            ) : (
              Array.from(groupedData.values()).map((jobOrder) => (
                <div key={jobOrder.job_order_id} className="mb-6 border rounded-lg overflow-hidden">
                  {/* Job Order Header */}
                  <div className="bg-gray-50 px-4 py-3 border-b">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="font-semibold text-gray-900">
                          {jobOrder.job_order_number || jobOrder.job_order_id}
                        </div>
                        <div className="text-sm text-gray-600">{jobOrder.brand_name}</div>
                        <div className="text-sm text-gray-600">{jobOrder.model_name}</div>
                        <div className="text-sm font-medium text-blue-600">
                          Total: {jobOrder.total_quantity} / {jobOrder.expected_quantity}
                        </div>
                      </div>
                      <Link 
                        to={`/job-orders/${jobOrder.job_order_id}`} 
                        className="inline-flex items-center px-3 py-1 border rounded text-blue-700 border-blue-300 hover:bg-blue-50 text-sm"
                      >
                        {t('commonExt.view')}
                      </Link>
                    </div>
                  </div>
                  
                  {/* Colors and Sizes */}
                  <div className="divide-y">
                    {Array.from(jobOrder.colors.values()).map((color) => (
                      <div key={color.color_name} className="bg-white">
                        {/* Color Header */}
                        <div className="bg-blue-50 px-4 py-2 border-b">
                          <div className="flex items-center justify-between">
                            <div className="font-medium text-blue-900">{color.color_name}</div>
                            <div className="text-sm font-medium text-blue-700">
                              Total: {color.total_quantity} / {color.expected_quantity}
                            </div>
                          </div>
                        </div>
                        
                        {/* Sizes */}
                        <div className="divide-y">
                          {Array.from(color.sizes.values()).map((size) => (
                            <div key={size.size_value} className="px-4 py-3 flex items-center justify-between">
                              <div className="flex items-center space-x-4">
                                <div className="w-16 text-sm text-gray-500">{t('dashboard.size')}</div>
                                <div className="font-medium">{size.size_value}</div>
                              </div>
                              <div className="flex items-center space-x-4">
                                <div className="text-sm text-gray-500">{t('dashboard.quantity')}</div>
                                <div className="font-semibold text-gray-900">
                                  {size.total_quantity} / {size.expected_quantity}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <Layout>
      <div className="flex flex-col h-full">
        <div className="flex-shrink-0 mb-4">
          <h1 className="text-2xl font-bold mb-2 text-gray-800">{t('dashboard.title')}</h1>
          <p className="text-gray-600">
            {t('dashboard.welcome', { username: user?.username })}
          </p>
        </div>

        {/* Stats Overview */}
        <div className="flex-shrink-0 grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-green">
            <div className="text-sm text-gray-500 mb-1">{t('dashboard.stats.totalBatches')}</div>
            <div className="text-2xl font-bold text-gray-800">{stats.total_batches}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-blue-500">
            <div className="text-sm text-gray-500 mb-1">{t('dashboard.stats.inProduction')}</div>
            <div className="text-2xl font-bold text-gray-800">{stats.in_production}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-green-500">
            <div className="text-sm text-gray-500 mb-1">{t('dashboard.stats.completed')}</div>
            <div className="text-2xl font-bold text-gray-800">{stats.completed}</div>
          </div>
        </div>

      {/* Tabbed Dashboard for non-admin users */}
      {user && user.role !== 'Admin' && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Custom Tab Navigation */}
          <div className="flex border-b mb-0 flex-shrink-0">
            <button
              onClick={() => {
                setActiveTab('job-orders');
                setLoadedTabs(prev => new Set([...prev, 'job-orders']));
              }}
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                activeTab === 'job-orders'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t('dashboard.jobOrders.title')}
            </button>
            {user.role !== 'Creator' && (
              <>
                <button
                  onClick={() => {
                    setActiveTab('pending');
                    setLoadedTabs(prev => new Set([...prev, 'pending']));
                  }}
                  className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                    activeTab === 'pending'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {t('dashboard.pendingItems')}
                </button>
                <button
                  onClick={() => {
                    setActiveTab('in-progress');
                    setLoadedTabs(prev => new Set([...prev, 'in-progress']));
                  }}
                  className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                    activeTab === 'in-progress'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {t('dashboard.inProgressItems')}
                </button>
              </>
            )}
          </div>
          
          {/* Tab Content */}
          <div className="flex-1 flex flex-col min-h-0">
            {/* Job Orders Tab */}
            {activeTab === 'job-orders' && loadedTabs.has('job-orders') && (
              <Card className="flex-1 flex flex-col min-h-0 h-full border-0 shadow-none">
                <CardHeader className="flex-shrink-0">
                  <CardTitle className="text-lg font-medium">{t('dashboard.jobOrders.recent')}</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col min-h-0">
                  {/* Filters */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 flex-shrink-0">
                    <div>
                      <div className="text-xs text-gray-600 mb-1">{t('dashboard.jobOrders.filters.jobOrderNumber')}</div>
                      <Input
                        placeholder={t('dashboard.jobOrders.filters.jobOrderNumberPlaceholder')}
                        value={joFilters.job_order_number}
                        onChange={e => setJoFilters(prev => ({ ...prev, job_order_number: e.target.value }))}
                      />
                    </div>
                    <div>
                      <div className="text-xs text-gray-600 mb-1">{t('dashboard.jobOrders.filters.model')}</div>
                      <Input
                        placeholder={t('dashboard.jobOrders.filters.modelPlaceholder')}
                        value={joFilters.model_name}
                        onChange={e => setJoFilters(prev => ({ ...prev, model_name: e.target.value }))}
                      />
                    </div>
                    <div>
                      <div className="text-xs text-gray-600 mb-1">{t('dashboard.jobOrders.filters.brand')}</div>
                      <SearchableDropdown
                        options={brandOptions}
                        value={joFilters.brand_name}
                        onChange={(value) => setJoFilters(prev => ({ ...prev, brand_name: value }))}
                        placeholder={t('dashboard.jobOrders.filters.brandPlaceholder')}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end mb-3 flex-shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setJoFilters({ job_order_number: '', model_name: '', brand_name: '' })}
                    >
                      {t('commonExt.clearFilters')}
                    </Button>
                  </div>
                  {loadingJobOrders ? (
                    <div className="flex-1 flex items-center justify-center text-gray-500">{t('dashboard.jobOrders.loading')}</div>
                  ) : jobOrderSummaries.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-gray-500">{t('dashboard.jobOrders.none')}</div>
                  ) : (
                    <div
                      className="flex-1 overflow-x-auto overflow-y-auto min-h-0"
                      onScroll={(e) => {
                        const target = e.currentTarget;
                        if (hasMoreJobOrders && !isLoadingMore && target.scrollTop + target.clientHeight >= target.scrollHeight - 50) {
                          fetchJobOrders(false);
                        }
                      }}
                    >
                      <table className="min-w-full text-sm">
                        <thead className="sticky top-0 bg-gray-50 z-10">
                          <tr>
                            <th className="px-3 py-2 text-left">{t('dashboard.jobOrders.columns.number')}</th>
                            <th className="px-3 py-2 text-left">{t('dashboard.jobOrders.columns.model')}</th>
                            <th className="px-3 py-2 text-left">{t('dashboard.jobOrders.columns.brand')}</th>
                            <th className="px-3 py-2 text-right">{t('dashboard.jobOrders.columns.expected')}</th>
                            <th className="px-3 py-2 text-right">{t('dashboard.jobOrders.columns.working')}</th>
                            <th className="px-3 py-2 text-right">{t('dashboard.jobOrders.columns.completed')}</th>
                            <th className="px-3 py-2 text-right">{t('dashboard.jobOrders.columns.actions')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {jobOrderSummaries.map((jo, idx) => (
                            <tr key={jo.job_order_id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                              <td className="px-3 py-2">{jo.job_order_number}</td>
                              <td className="px-3 py-2">{jo.model_name || '-'}</td>
                              <td className="px-3 py-2">{jo.brand_name || '-'}</td>
                              <td className="px-3 py-2 text-right">{jo.total_expected_quantity?.toLocaleString?.() ?? jo.total_expected_quantity}</td>
                              <td className="px-3 py-2 text-right">{jo.total_produced_quantity?.toLocaleString?.() ?? jo.total_produced_quantity}</td>
                              <td className="px-3 py-2 text-right">{jo.completed_quantity?.toLocaleString?.() ?? jo.completed_quantity}</td>
                              <td className="px-3 py-2 text-right">
                                <Link to={`/job-orders/${jo.job_order_id}`} className="inline-flex items-center px-2 py-1 border rounded text-blue-700 border-blue-300 hover:bg-blue-50">
                                  {t('dashboard.jobOrders.viewDetails')}
                                </Link>
                              </td>
                            </tr>
                          ))}
                          {hasMoreJobOrders && (
                            <tr>
                              <td colSpan={7} className="px-3 py-3 text-center text-gray-500">
                                {isLoadingMore ? t('common.loadingMore') : ''}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            
            {/* Pending Items Tab */}
            {user.role !== 'Creator' && activeTab === 'pending' && loadedTabs.has('pending') && (
              <div className="flex-1 flex flex-col min-h-0">
                <Card className="flex-1 flex flex-col min-h-0 h-full border-0 shadow-none">
                  <CardHeader className="flex-shrink-0">
                    <CardTitle className="text-lg font-medium">{t('dashboard.pendingItems')}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col min-h-0">
                    {/* Search Filters */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 flex-shrink-0">
                      <div>
                        <div className="text-xs text-gray-600 mb-1">{t('dashboard.jobOrders.filters.jobOrderNumber')}</div>
                        <Input
                          placeholder={t('dashboard.jobOrders.filters.jobOrderNumberPlaceholder')}
                          value={itemFilters.job_order_number}
                          onChange={e => setItemFilters(prev => ({ ...prev, job_order_number: e.target.value }))}
                        />
                      </div>
                      <div>
                        <div className="text-xs text-gray-600 mb-1">{t('dashboard.jobOrders.filters.model')}</div>
                        <Input
                          placeholder={t('dashboard.jobOrders.filters.modelPlaceholder')}
                          value={itemFilters.model_name}
                          onChange={e => setItemFilters(prev => ({ ...prev, model_name: e.target.value }))}
                        />
                      </div>
                      <div>
                        <div className="text-xs text-gray-600 mb-1">{t('dashboard.jobOrders.filters.brand')}</div>
                        <SearchableDropdown
                          options={brandOptions}
                          value={itemFilters.brand_name}
                          onChange={(value) => setItemFilters(prev => ({ ...prev, brand_name: value }))}
                          placeholder={t('dashboard.jobOrders.filters.brandPlaceholder')}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end mb-3 flex-shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setItemFilters({ job_order_number: '', model_name: '', brand_name: '' })}
                      >
                        {t('commonExt.clearFilters')}
                      </Button>
                    </div>
                    {renderAggregatedItemList(
                      phaseBarcodes[user.role.toLowerCase()].pending,
                      t('dashboard.pendingItems')
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
            
            {/* In Progress Items Tab */}
            {user.role !== 'Creator' && activeTab === 'in-progress' && loadedTabs.has('in-progress') && (
              <div className="flex-1 flex flex-col min-h-0">
                <Card className="flex-1 flex flex-col min-h-0 h-full border-0 shadow-none">
                  <CardHeader className="flex-shrink-0">
                    <CardTitle className="text-lg font-medium">{t('dashboard.inProgressItems')}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col min-h-0">
                    {/* Search Filters */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 flex-shrink-0">
                      <div>
                        <div className="text-xs text-gray-600 mb-1">{t('dashboard.jobOrders.filters.jobOrderNumber')}</div>
                        <Input
                          placeholder={t('dashboard.jobOrders.filters.jobOrderNumberPlaceholder')}
                          value={itemFilters.job_order_number}
                          onChange={e => setItemFilters(prev => ({ ...prev, job_order_number: e.target.value }))}
                        />
                      </div>
                      <div>
                        <div className="text-xs text-gray-600 mb-1">{t('dashboard.jobOrders.filters.model')}</div>
                        <Input
                          placeholder={t('dashboard.jobOrders.filters.modelPlaceholder')}
                          value={itemFilters.model_name}
                          onChange={e => setItemFilters(prev => ({ ...prev, model_name: e.target.value }))}
                        />
                      </div>
                      <div>
                        <div className="text-xs text-gray-600 mb-1">{t('dashboard.jobOrders.filters.brand')}</div>
                        <SearchableDropdown
                          options={brandOptions}
                          value={itemFilters.brand_name}
                          onChange={(value) => setItemFilters(prev => ({ ...prev, brand_name: value }))}
                          placeholder={t('dashboard.jobOrders.filters.brandPlaceholder')}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end mb-3 flex-shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setItemFilters({ job_order_number: '', model_name: '', brand_name: '' })}
                      >
                        {t('commonExt.clearFilters')}
                      </Button>
                    </div>
                    {renderAggregatedItemList(
                      phaseBarcodes[user.role.toLowerCase()].in_progress,
                      t('dashboard.inProgressItems')
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      )}

              {/* Admin Dashboard */}
        {user && user.role === 'Admin' && (
          <div className="flex-1 flex flex-col min-h-0">
            <h2 className="text-xl font-semibold mb-3 text-gray-700 flex-shrink-0">
              Production Phase Distribution
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1">
              {/* Overall Production Phase Graph */}
              <Card className="flex flex-col">
                <CardHeader className="flex-shrink-0">
                  <CardTitle className="text-lg font-medium">{t('dashboard.overallProductionStatus')}</CardTitle>
                </CardHeader>
                <CardContent className="pt-2 flex-1">
                  <div className="h-full w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={productionPhaseData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                        <XAxis 
                          dataKey="phase" 
                          angle={-45}
                          textAnchor="end"
                          height={60}
                          interval={0}
                        />
                        <YAxis />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const data = payload[0].payload;
                            return (
                              <div className="bg-white p-3 border border-gray-200 shadow-md rounded-md">
                                <p className="font-medium text-gray-800">{data.phase}</p>
                                <p className="text-sm mt-1">{t('common.count')}: <span className="font-medium">{data.count}</span></p>
                              </div>
                            );
                          }}
                        />
                        <Bar dataKey="count" minPointSize={2}>
                          {productionPhaseData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                          <LabelList dataKey="count" content={renderCustomLabel} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Individual Phase Detailed Graphs */}
              {phaseConfig.map((phase, index) => {
                const phaseData = getPhaseData(phase.key, phase.color);
                const phaseTitleKey = `${phase.key}PhaseStatus`;
                
                return (
                  <Card key={phase.key} className="flex flex-col">
                    <CardHeader className="flex-shrink-0">
                      <CardTitle className="text-lg font-medium">{t(`dashboard.${phaseTitleKey}`)}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-2 flex-1">
                      <div className="h-full w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={phaseData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                            <XAxis 
                              dataKey="status" 
                              angle={-45}
                              textAnchor="end"
                              height={60}
                              interval={0}
                            />
                            <YAxis />
                            <Tooltip
                              content={({ active, payload }) => {
                                if (!active || !payload?.length) return null;
                                const data = payload[0].payload;
                                return (
                                  <div className="bg-white p-3 border border-gray-200 shadow-md rounded-md">
                                    <p className="font-medium text-gray-800">{data.status}</p>
                                    <p className="text-sm mt-1">{t('common.count')}: <span className="font-medium">{data.count}</span></p>
                                  </div>
                                );
                              }}
                            />
                            <Bar dataKey="count" minPointSize={2}>
                              {phaseData.map((entry, cellIndex) => (
                                <Cell key={`cell-${cellIndex}`} fill={entry.color} />
                              ))}
                              <LabelList dataKey="count" content={renderCustomLabel} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            
            {/* Handle Monitor for Admin */}
            <div className="mt-6">
              <HandleMonitor />
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default DashboardPage;
