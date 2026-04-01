import React, { Suspense, lazy } from 'react';
import Layout from '../components/Layout';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { BarChart3, Activity } from 'lucide-react';

const OverviewTab = lazy(() => import('./advanced-statistics/OverviewTab'));
const PhasesTab = lazy(() => import('./advanced-statistics/PhasesTab'));

const AdvancedStatisticsPage: React.FC = () => {
  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">
              Advanced Statistics
            </h1>
          </div>
        </div>

        <Tabs defaultValue="management" className="w-full">
          <TabsList className="mx-auto flex w-full flex-wrap gap-2 rounded-2xl bg-gray-100 p-1 shadow-sm h-auto">
            <TabsTrigger
              value="management"
              className="flex-1 min-w-[12rem] flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium text-gray-600 transition-all data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-blue-100"
            >
              <BarChart3 className="h-4 w-4" />
              <span className="truncate">Production Management</span>
            </TabsTrigger>
            <TabsTrigger
              value="tracking"
              className="flex-1 min-w-[12rem] flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium text-gray-600 transition-all data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-blue-100"
            >
              <Activity className="h-4 w-4" />
              <span className="truncate">Production Operations</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="management" className="mt-4">
            <Suspense
              fallback={
                <div className="py-8 text-center text-gray-500">
                  Loading production management...
                </div>
              }
            >
              <OverviewTab />
            </Suspense>
          </TabsContent>

          <TabsContent value="tracking" className="mt-4">
            <Suspense
              fallback={
                <div className="py-8 text-center text-gray-500">
                  Loading production tracking...
                </div>
              }
            >
              <PhasesTab />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default AdvancedStatisticsPage;

