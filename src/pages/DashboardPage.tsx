
import React from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const DashboardPage: React.FC = () => {
  const { user } = useAuth();

  const stats = {
    totalBarcodes: 1245,
    inPhase: 423,
    outPhase: 682,
    pendingPhase: 140,
    recentActivities: [
      { id: 1, action: 'Barcode Scanned', user: 'John', barcode: '78901234', time: '2 minutes ago' },
      { id: 2, action: 'Status Updated', user: 'Emily', barcode: '56789012', time: '10 minutes ago' },
      { id: 3, action: 'New Barcode Created', user: 'Michael', barcode: '34567890', time: '25 minutes ago' },
      { id: 4, action: 'Phase Changed', user: 'Sarah', barcode: '12345678', time: '1 hour ago' },
    ]
  };

  // Production phase data for Admin
  const productionPhaseData = [
    { phase: 'Cutting', count: 432 },
    { phase: 'Sewing', count: 378 },
    { phase: 'Packaging', count: 435 },
  ];

  // Role-specific metrics
  const roleMetrics = {
    'Admin': {
      title: 'System Overview',
      metrics: [
        { name: 'Total Users', value: 24, change: '+3', icon: '👥' },
        { name: 'Active Workflows', value: 8, change: '+1', icon: '⚙️' },
        { name: 'System Uptime', value: '99.8%', change: '+0.2%', icon: '⏱️' },
      ]
    },
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

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2 text-gray-800">Dashboard</h1>
        <p className="text-gray-600">
          Welcome back, <span className="font-semibold">{user?.username}</span>. Here's your overview.
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-green">
          <div className="text-sm text-gray-500 mb-1">Total Barcodes</div>
          <div className="text-2xl font-bold">{stats.totalBarcodes}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-mint">
          <div className="text-sm text-gray-500 mb-1">In Phase</div>
          <div className="text-2xl font-bold">{stats.inPhase}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-red-500">
          <div className="text-sm text-gray-500 mb-1">Out Phase</div>
          <div className="text-2xl font-bold">{stats.outPhase}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-yellow-500">
          <div className="text-sm text-gray-500 mb-1">Pending</div>
          <div className="text-2xl font-bold">{stats.pendingPhase}</div>
        </div>
      </div>

      {/* Production Phase Distribution for Admin */}
      {user && user.role === 'Admin' && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-3 text-gray-700">
            Production Phase Distribution
          </h2>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-medium">Items in Each Production Phase</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="h-80 w-full">
                <ChartContainer
                  config={{
                    Cutting: { color: '#118B50' },    // primary green
                    Sewing: { color: '#5DB996' },     // mint green
                    Packaging: { color: '#E3F0AF' },  // light lime
                  }}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={productionPhaseData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                      <XAxis dataKey="phase" />
                      <YAxis />
                      <Tooltip content={(props) => {
                        if (!props.active || !props.payload?.length) return null;
                        const data = props.payload[0].payload;
                        return (
                          <div className="bg-white p-2 border border-gray-200 shadow-sm rounded">
                            <p className="font-medium">{data.phase}</p>
                            <p className="text-sm">Count: {data.count}</p>
                          </div>
                        );
                      }} />
                      <Bar dataKey="count" fill="#118B50">
                        {productionPhaseData.map((entry, index) => {
                          const colors = ['#118B50', '#5DB996', '#E3F0AF'];
                          return <Bar key={`bar-${index}`} dataKey="count" fill={colors[index % colors.length]} />
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </div>
            </CardContent>
          </Card>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activities */}
        <div className="bg-white rounded-lg shadow-sm p-5">
          <h2 className="text-xl font-semibold mb-4 text-gray-700">Recent Activities</h2>
          <div className="overflow-hidden">
            <ul className="divide-y divide-gray-200">
              {stats.recentActivities.map(activity => (
                <li key={activity.id} className="py-3">
                  <div className="flex justify-between">
                    <div>
                      <p className="font-medium">{activity.action}</p>
                      <p className="text-sm text-gray-500">
                        {activity.user} - Barcode: {activity.barcode}
                      </p>
                    </div>
                    <div className="text-sm text-gray-500">{activity.time}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-4">
            <button className="text-green hover:underline text-sm font-medium">
              View All Activities
            </button>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow-sm p-5">
          <h2 className="text-xl font-semibold mb-4 text-gray-700">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-4">
            <button className="p-4 bg-lime rounded-lg text-center hover:bg-opacity-80 transition-colors">
              <div className="text-lg mb-2">📋</div>
              <div className="font-medium">Scan Barcode</div>
            </button>
            <button className="p-4 bg-lime rounded-lg text-center hover:bg-opacity-80 transition-colors">
              <div className="text-lg mb-2">🔍</div>
              <div className="font-medium">Search Inventory</div>
            </button>
            <button className="p-4 bg-lime rounded-lg text-center hover:bg-opacity-80 transition-colors">
              <div className="text-lg mb-2">🖨️</div>
              <div className="font-medium">Print Labels</div>
            </button>
            <button className="p-4 bg-lime rounded-lg text-center hover:bg-opacity-80 transition-colors">
              <div className="text-lg mb-2">📊</div>
              <div className="font-medium">View Reports</div>
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default DashboardPage;
