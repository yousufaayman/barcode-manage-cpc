import React from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Search, FileText, Users } from 'lucide-react';

const OverviewTab: React.FC = () => {
  return (
    <div className="space-y-4">
      <Tabs defaultValue="model-search" className="w-full mt-4">
        <div className="rounded-2xl border border-gray-200 bg-white/60 p-1.5 shadow-sm">
          <TabsList className="flex w-full flex-wrap gap-1.5 bg-transparent p-0 h-auto">
            <TabsTrigger
              value="model-search"
              className="flex-1 min-w-[11rem] sm:min-w-0 flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 data-[state=active]:shadow-sm"
            >
              <Search className="h-4 w-4" />
              <span>Model Search</span>
            </TabsTrigger>
            <TabsTrigger
              value="job-order-search"
              className="flex-1 min-w-[11rem] sm:min-w-0 flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 data-[state=active]:shadow-sm"
            >
              <FileText className="h-4 w-4" />
              <span>Job Order Search</span>
            </TabsTrigger>
            <TabsTrigger
              value="client-search"
              className="flex-1 min-w-[11rem] sm:min-w-0 flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 data-[state=active]:shadow-sm"
            >
              <Users className="h-4 w-4" />
              <span>Client Search</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="model-search" className="mt-4">
          <div className="rounded-lg border border-dashed border-gray-200 p-4 md:p-6 text-sm text-gray-600">
            <h3 className="text-base font-semibold text-gray-800">Model Search</h3>
          </div>
        </TabsContent>

        <TabsContent value="job-order-search" className="mt-4">
          <div className="rounded-lg border border-dashed border-gray-200 p-4 md:p-6 text-sm text-gray-600">
            <h3 className="text-base font-semibold text-gray-800">Job Order Search</h3>
          </div>
        </TabsContent>

        <TabsContent value="client-search" className="mt-4">
          <div className="rounded-lg border border-dashed border-gray-200 p-4 md:p-6 text-sm text-gray-600">
            <h3 className="text-base font-semibold text-gray-800">Client Search</h3>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default OverviewTab;

