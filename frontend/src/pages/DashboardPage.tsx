import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { barcodeApi, BatchStats, PhaseStats, BarcodeData } from '@/services/api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [batchStats, phaseData] = await Promise.all([
          barcodeApi.getBatchStats(),
          barcodeApi.getPhaseStats()
        ]);
        setStats(batchStats);
        setPhaseStats(phaseData);

        // Fetch barcodes for each phase if user is not admin
        if (user && user.role !== 'Admin' && user.role !== 'Creator') {
          const phase = user.role;
          const [pendingBarcodes, inProgressBarcodes] = await Promise.all([
            barcodeApi.getBarcodesByPhase(phase, 'Pending'),
            barcodeApi.getBarcodesByPhase(phase, 'In Progress')
          ]);

          setPhaseBarcodes(prev => ({
            ...prev,
            [phase.toLowerCase()]: {
              pending: pendingBarcodes.items,
              in_progress: inProgressBarcodes.items
            }
          }));
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };

    fetchData();
  }, [user]);

  // Overall production phase data
  const productionPhaseData = [
    { phase: t('phases.cutting'), count: phaseStats.cutting.pending + phaseStats.cutting.in_progress, color: 'rgb(30 64 175)' }, // Cutting blue
    { phase: t('phases.sewing'), count: phaseStats.sewing.pending + phaseStats.sewing.in_progress, color: 'rgb(107 33 168)' },  // Sewing purple
    { phase: t('phases.packaging'), count: phaseStats.packaging.pending + phaseStats.packaging.in_progress, color: 'rgb(154 52 18)' }, // Packaging brown
    { phase: t('phases.completed'), count: phaseStats.packaging.completed, color: '#90EE90' }, // light green
  ];

  const cuttingPhaseData = [
    { status: t('status.pending'), count: phaseStats.cutting.pending, color: 'rgb(30 64 175)' }, // Cutting blue
    { status: t('status.inProgress'), count: phaseStats.cutting.in_progress, color: 'rgb(30 64 175)' }, // Cutting blue
  ];

  const sewingPhaseData = [
    { status: t('status.pending'), count: phaseStats.sewing.pending, color: 'rgb(107 33 168)' }, // Sewing purple
    { status: t('status.inProgress'), count: phaseStats.sewing.in_progress, color: 'rgb(107 33 168)' }, // Sewing purple
  ];

  const packagingPhaseData = [
    { status: t('status.pending'), count: phaseStats.packaging.pending, color: 'rgb(154 52 18)' }, // Packaging brown
    { status: t('status.inProgress'), count: phaseStats.packaging.in_progress, color: 'rgb(154 52 18)' }, // Packaging brown
  ];

  const renderCustomLabel = (props: any) => {
    const { x, y, width, height, value } = props;
    const barHeight = height;
    // If bar height is less than 40px, show label above, otherwise inside
    const labelY = barHeight < 40 ? y - 8 : y + height / 2;
    const textAnchor = 'middle';
    const fill = barHeight < 40 ? '#374151' : '#ffffff'; // Dark gray above, white inside
    const fontSize = 16; // Increased font size from 14 to 16
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

  const renderBarcodeList = (barcodes: BarcodeData[], title: string) => (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-lg font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('barcode.barcode')}</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Color</TableHead>
              <TableHead>{t('barcode.quantity')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {barcodes.map((barcode) => (
              <TableRow key={barcode.barcode}>
                <TableCell>{barcode.barcode}</TableCell>
                <TableCell>{barcode.brand_name}</TableCell>
                <TableCell>{barcode.model_name}</TableCell>
                <TableCell>{barcode.size_value}</TableCell>
                <TableCell>{barcode.color_name}</TableCell>
                <TableCell>{barcode.quantity}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2 text-gray-800">{t('dashboard.title')}</h1>
        <p className="text-gray-600">
          Welcome back, <span className="font-semibold">{user?.username}</span>. Here's your overview.
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-green">
          <div className="text-sm text-gray-500 mb-1">Total Batches</div>
          <div className="text-2xl font-bold text-gray-800">{stats.total_batches}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-blue-500">
          <div className="text-sm text-gray-500 mb-1">In Production</div>
          <div className="text-2xl font-bold text-gray-800">{stats.in_production}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-green-500">
          <div className="text-sm text-gray-500 mb-1">Completed</div>
          <div className="text-2xl font-bold text-gray-800">{stats.completed}</div>
        </div>
      </div>

      {/* Phase-specific content for non-admin users */}
      {user && user.role !== 'Admin' && user.role !== 'Creator' && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-3 text-gray-700">
            {user.role} Department Overview
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-white p-4 rounded-lg shadow-sm">
              <div className="text-sm text-gray-500 mb-1">Pending Items</div>
              <div className="text-2xl font-bold">
                {phaseStats[user.role.toLowerCase() as keyof PhaseStats].pending}
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm">
              <div className="text-sm text-gray-500 mb-1">In Progress</div>
              <div className="text-2xl font-bold">
                {phaseStats[user.role.toLowerCase() as keyof PhaseStats].in_progress}
              </div>
            </div>
          </div>

          {/* Barcode Lists */}
          <div className="space-y-6">
            {renderBarcodeList(
              phaseBarcodes[user.role.toLowerCase()].pending,
              'Pending Items'
            )}
            {renderBarcodeList(
              phaseBarcodes[user.role.toLowerCase()].in_progress,
              'In Progress Items'
            )}
          </div>
        </div>
      )}

      {/* Admin Dashboard */}
      {user && user.role === 'Admin' && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-3 text-gray-700">
            Production Phase Distribution
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Overall Production Phase Graph */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-medium">{t('dashboard.overallProductionStatus')}</CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={productionPhaseData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                      <XAxis dataKey="phase" />
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
                      <Bar dataKey="count">
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

            {/* Cutting Phase Detailed Graph */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-medium">{t('dashboard.cuttingPhaseStatus')}</CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cuttingPhaseData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                      <XAxis dataKey="status" />
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
                      <Bar dataKey="count">
                        {cuttingPhaseData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                        <LabelList dataKey="count" content={renderCustomLabel} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Sewing Phase Detailed Graph */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-medium">{t('dashboard.sewingPhaseStatus')}</CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sewingPhaseData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                      <XAxis dataKey="status" />
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
                      <Bar dataKey="count">
                        {sewingPhaseData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                        <LabelList dataKey="count" content={renderCustomLabel} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Packaging Phase Detailed Graph */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-medium">{t('dashboard.packagingPhaseStatus')}</CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={packagingPhaseData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                      <XAxis dataKey="status" />
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
                      <Bar dataKey="count">
                        {packagingPhaseData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                        <LabelList dataKey="count" content={renderCustomLabel} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default DashboardPage;
