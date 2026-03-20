import React, { Suspense, lazy } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const CuttingSubTab = lazy(() => import('./CuttingSubTab'));
const SewingSubTab = lazy(() => import('./SewingSubTab'));
const QcSubTab = lazy(() => import('./QcSubTab'));
const PackagingSubTab = lazy(() => import('./PackagingSubTab'));
const WorkersSubTab = lazy(() => import('./WorkersSubTab'));

const tabFallback = (
  <div className="flex items-center justify-center py-12 text-sm text-gray-500">
    Loading…
  </div>
);

const PhasesTab: React.FC = () => {
  return (
    <div className="space-y-4">
      <p className="text-gray-600">
        Use the subtabs below to focus production tracking analytics on Cutting,
        Sewing, QC, Packaging, or Workers.
      </p>

      <Tabs defaultValue="cutting" className="w-full mt-4">
        <div className="rounded-xl border border-gray-200 bg-white/60 p-2 shadow-sm">
          <TabsList className="grid w-full grid-cols-2 gap-1 text-xs sm:grid-cols-5 sm:text-sm bg-transparent p-0">
            <TabsTrigger
              value="cutting"
              className="flex items-center justify-center gap-2 rounded-lg px-3 py-2 data-[state=active]:bg-green-50 data-[state=active]:text-green-700 data-[state=active]:shadow-sm"
            >
              <span>Cutting</span>
            </TabsTrigger>
            <TabsTrigger
              value="sewing"
              className="flex items-center justify-center gap-2 rounded-lg px-3 py-2 data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm"
            >
              <span>Sewing</span>
            </TabsTrigger>
            <TabsTrigger
              value="qc"
              className="flex items-center justify-center gap-2 rounded-lg px-3 py-2 data-[state=active]:bg-yellow-50 data-[state=active]:text-yellow-700 data-[state=active]:shadow-sm"
            >
              <span>QC</span>
            </TabsTrigger>
            <TabsTrigger
              value="packaging"
              className="flex items-center justify-center gap-2 rounded-lg px-3 py-2 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700 data-[state=active]:shadow-sm"
            >
              <span>Packaging</span>
            </TabsTrigger>
            <TabsTrigger
              value="workers"
              className="flex items-center justify-center gap-2 rounded-lg px-3 py-2 data-[state=active]:bg-slate-50 data-[state=active]:text-slate-700 data-[state=active]:shadow-sm"
            >
              <span>Workers</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="cutting" className="mt-4">
          <Suspense fallback={tabFallback}>
            <CuttingSubTab />
          </Suspense>
        </TabsContent>

        <TabsContent value="sewing" className="mt-4">
          <Suspense fallback={tabFallback}>
            <SewingSubTab />
          </Suspense>
        </TabsContent>

        <TabsContent value="qc" className="mt-4">
          <Suspense fallback={tabFallback}>
            <QcSubTab />
          </Suspense>
        </TabsContent>

        <TabsContent value="packaging" className="mt-4">
          <Suspense fallback={tabFallback}>
            <PackagingSubTab />
          </Suspense>
        </TabsContent>

        <TabsContent value="workers" className="mt-4">
          <Suspense fallback={tabFallback}>
            <WorkersSubTab />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PhasesTab;
