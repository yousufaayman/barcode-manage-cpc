import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { barcodeApi, BatchStats, PhaseStats, BarcodeData } from '@/services/api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const DashboardPage: React.FC = () => {
  const { user } = useAuth();
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
        if (user && user.role !== 'Admin') {
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
    { phase: 'Cutting', count: phaseStats.cutting.pending + phaseStats.cutting.in_progress, color: 'rgb(30 64 175)' }, // Cutting blue
    { phase: 'Sewing', count: phaseStats.sewing.pending + phaseStats.sewing.in_progress, color: 'rgb(107 33 168)' },  // Sewing purple
    { phase: 'Packaging', count: phaseStats.packaging.pending + phaseStats.packaging.in_progress, color: 'rgb(154 52 18)' }, // Packaging brown
    { phase: 'Completed', count: phaseStats.packaging.completed, color: '#90EE90' }, // light green
  ];

  const cuttingPhaseData = [
    { status: 'Pending', count: phaseStats.cutting.pending, color: 'rgb(30 64 175)' }, // Cutting blue
    { status: 'In Progress', count: phaseStats.cutting.in_progress, color: 'rgb(30 64 175)' }, // Cutting blue
  ];

  const sewingPhaseData = [
    { status: 'Pending', count: phaseStats.sewing.pending, color: 'rgb(107 33 168)' }, // Sewing purple
    { status: 'In Progress', count: phaseStats.sewing.in_progress, color: 'rgb(107 33 168)' }, // Sewing purple
  ];

  const packagingPhaseData = [
    { status: 'Pending', count: phaseStats.packaging.pending, color: 'rgb(154 52 18)' }, // Packaging brown
    { status: 'In Progress', count: phaseStats.packaging.in_progress, color: 'rgb(154 52 18)' }, // Packaging brown
  ];

  const roleMetrics = {
    'Cutting': {
      title: 'Cutting Department',
      metrics: [
        { name: 'Cut Today', value: 78, change: '+12', icon: '✂️' },
        { name: 'Pending Cuts', value: 23, change: '-5', icon: '⏳' },
        { name: 'Material Usage', value: '92%', change: '+2%', icon: '📊' },
      ]
    },
    'Sewing': {
      title: 'Sewing Department',
      metrics: [
        { name: 'Sewn Today', value: 64, change: '+8', icon: '🧵' },
        { name: 'Pending Sewing', value: 18, change: '-3', icon: '⏳' },
        { name: 'Quality Rate', value: '95%', change: '+1%', icon: '⭐' },
      ]
    },
    'Packaging': {
      title: 'Packaging Department',
      metrics: [
        { name: 'Packed Today', value: 86, change: '+14', icon: '📦' },
        { name: 'Ready to Ship', value: 32, change: '+7', icon: '🚚' },
        { name: 'Pending Packaging', value: 12, change: '-8', icon: '⏳' },
      ]
    }
  };

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
              <TableHead>Barcode</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Color</TableHead>
              <TableHead>Quantity</TableHead>
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
        <h1 className="text-2xl font-bold mb-2 text-gray-800">Dashboard</h1>
        <p className="text-gray-600">
          Welcome back, <span className="font-semibold">{user?.username}</span>. Here's your overview.
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-green">
          <div className="text-sm text-gray-500 mb-1">Total Batches</div>
          <div className="text-2xl font-bold">{stats.total_batches}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-mint">
          <div className="text-sm text-gray-500 mb-1">In Production</div>
          <div className="text-2xl font-bold">{stats.in_production}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-yellow-500">
          <div className="text-sm text-gray-500 mb-1">Completed</div>
          <div className="text-2xl font-bold">{stats.completed}</div>
        </div>
      </div>

      {/* Phase-specific content for non-admin users */}
      {user && user.role !== 'Admin' && (
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
                <CardTitle className="text-lg font-medium">Overall Production Status</CardTitle>
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
                              <p className="text-sm mt-1">Count: <span className="font-medium">{data.count}</span></p>
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
                <CardTitle className="text-lg font-medium">Cutting Phase Status</CardTitle>
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
                              <p className="text-sm mt-1">Count: <span className="font-medium">{data.count}</span></p>
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
                <CardTitle className="text-lg font-medium">Sewing Phase Status</CardTitle>
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
                              <p className="text-sm mt-1">Count: <span className="font-medium">{data.count}</span></p>
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
                <CardTitle className="text-lg font-medium">Packaging Phase Status</CardTitle>
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
                              <p className="text-sm mt-1">Count: <span className="font-medium">{data.count}</span></p>
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

      {/* Role specific metrics */}
      {user && roleMetrics[user.role as keyof typeof roleMetrics] && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-3 text-gray-700">
            {roleMetrics[user.role as keyof typeof roleMetrics].title}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {roleMetrics[user.role as keyof typeof roleMetrics].metrics.map((metric, index) => (
              <div key={index} className="bg-white p-5 rounded-lg shadow-sm">
                <div className="flex justify-between items-center">
                  <span className="text-2xl">{metric.icon}</span>
                  <span className={`text-sm font-medium ${metric.change.startsWith('+') ? 'text-green' : 'text-red-500'}`}>
                    {metric.change}
                  </span>
                </div>
                <div className="mt-2 text-2xl font-bold">{metric.value}</div>
                <div className="text-sm text-gray-500">{metric.name}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Layout>
  );
};

export default DashboardPage;
