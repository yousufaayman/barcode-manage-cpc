import React from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Search, FileText, Users } from 'lucide-react';

const OverviewTab: React.FC = () => {
  return (
    <div className="space-y-4">
      <p className="text-gray-600">
        Use the subtabs below to explore production management analytics by model, job order, or client.
      </p>

      <Tabs defaultValue="model-search" className="w-full mt-4">
        <div className="rounded-xl border border-gray-200 bg-white/60 p-2 shadow-sm">
          <TabsList className="grid w-full grid-cols-1 gap-1 text-xs sm:grid-cols-3 sm:text-sm bg-transparent p-0">
            <TabsTrigger
              value="model-search"
              className="flex items-center justify-center gap-2 rounded-lg px-3 py-2 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 data-[state=active]:shadow-sm"
            >
              <Search className="h-4 w-4" />
              <span>Model Search</span>
            </TabsTrigger>
            <TabsTrigger
              value="job-order-search"
              className="flex items-center justify-center gap-2 rounded-lg px-3 py-2 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 data-[state=active]:shadow-sm"
            >
              <FileText className="h-4 w-4" />
              <span>Job Order Search</span>
            </TabsTrigger>
            <TabsTrigger
              value="client-search"
              className="flex items-center justify-center gap-2 rounded-lg px-3 py-2 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 data-[state=active]:shadow-sm"
            >
              <Users className="h-4 w-4" />
              <span>Client Search</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="model-search" className="mt-4">
          <div className="rounded-lg border border-dashed border-gray-200 p-6 text-sm text-gray-600">
            <h3 className="mb-2 text-base font-semibold text-gray-800">Model Search</h3>
            <p>
              Placeholder for model-based production management analytics. Here you can add filters,
              metrics, and charts focused on models.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="job-order-search" className="mt-4">
          <div className="rounded-lg border border-dashed border-gray-200 p-6 text-sm text-gray-600">
            <h3 className="mb-2 text-base font-semibold text-gray-800">Job Order Search</h3>
            <p>
              Placeholder for job-order-based production management analytics. This will host job order
              search, status breakdowns, and related KPIs.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="client-search" className="mt-4">
          <div className="rounded-lg border border-dashed border-gray-200 p-6 text-sm text-gray-600">
            <h3 className="mb-2 text-base font-semibold text-gray-800">Client Search</h3>
            <p>
              Placeholder for client-level production management analytics. Here you can add views for
              brands/clients, their models, and overall performance.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default OverviewTab;

