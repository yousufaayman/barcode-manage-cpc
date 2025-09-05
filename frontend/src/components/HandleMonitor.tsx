import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import { RefreshCw, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

interface ProcessInfo {
  pid: number;
  file_descriptors: number;
  connections: number;
  open_files: number;
  memory_info: {
    rss: number;
    vms: number;
  };
  cpu_percent: number;
  connections_detail: Array<{
    fd: number;
    family: string;
    type: string;
    local_address: string;
    remote_address: string;
    status: string;
  }>;
  open_files_detail: Array<{
    path: string;
    fd: number;
  }>;
}

interface SystemLimits {
  file_descriptors?: {
    soft_limit: number;
    hard_limit: number;
  };
  system_file_descriptors?: {
    allocated: number;
    unused: number;
    max_files: number;
    usage_percentage: number;
  };
}

interface HandleMonitorData {
  status: string;
  timestamp: number;
  process_info: ProcessInfo;
  system_limits: SystemLimits;
  warnings: string[];
  error?: string;
}

const HandleMonitor: React.FC = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<HandleMonitorData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHandleData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/health/handles');
      setData(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to fetch handle data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHandleData();
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      healthy: 'default',
      warning: 'secondary',
      error: 'destructive'
    } as const;

    return (
      <Badge variant={variants[status as keyof typeof variants] || 'default'}>
        {status}
      </Badge>
    );
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-500" />
            Handle Monitor Error
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button onClick={fetchHandleData} className="mt-4" disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading handle monitor data...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusIcon(data.status)}
            Handle Monitor
          </div>
          <div className="flex items-center gap-2">
            {getStatusBadge(data.status)}
            <Button
              onClick={fetchHandleData}
              size="sm"
              variant="outline"
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Warnings */}
        {data.warnings.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-1">
                {data.warnings.map((warning, index) => (
                  <div key={index}>{warning}</div>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Process Information */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Process Information</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="text-sm text-gray-600">PID</div>
              <div className="text-lg font-semibold">{data.process_info.pid}</div>
            </div>
            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="text-sm text-gray-600">File Descriptors</div>
              <div className="text-lg font-semibold">{data.process_info.file_descriptors}</div>
            </div>
            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="text-sm text-gray-600">Connections</div>
              <div className="text-lg font-semibold">{data.process_info.connections}</div>
            </div>
            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="text-sm text-gray-600">Open Files</div>
              <div className="text-lg font-semibold">{data.process_info.open_files}</div>
            </div>
          </div>
        </div>

        {/* Memory Information */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Memory Usage</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="text-sm text-gray-600">RSS Memory</div>
              <div className="text-lg font-semibold">{formatBytes(data.process_info.memory_info.rss)}</div>
            </div>
            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="text-sm text-gray-600">Virtual Memory</div>
              <div className="text-lg font-semibold">{formatBytes(data.process_info.memory_info.vms)}</div>
            </div>
          </div>
        </div>

        {/* System Limits */}
        {data.system_limits.file_descriptors && (
          <div>
            <h3 className="text-lg font-semibold mb-3">File Descriptor Limits</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="text-sm text-gray-600">Soft Limit</div>
                <div className="text-lg font-semibold">{data.system_limits.file_descriptors.soft_limit}</div>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="text-sm text-gray-600">Hard Limit</div>
                <div className="text-lg font-semibold">{data.system_limits.file_descriptors.hard_limit}</div>
              </div>
            </div>
          </div>
        )}

        {/* System-wide File Descriptors */}
        {data.system_limits.system_file_descriptors && (
          <div>
            <h3 className="text-lg font-semibold mb-3">System-wide File Descriptors</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="text-sm text-gray-600">Allocated</div>
                <div className="text-lg font-semibold">{data.system_limits.system_file_descriptors.allocated.toLocaleString()}</div>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="text-sm text-gray-600">Unused</div>
                <div className="text-lg font-semibold">{data.system_limits.system_file_descriptors.unused.toLocaleString()}</div>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="text-sm text-gray-600">Max Files</div>
                <div className="text-lg font-semibold">{data.system_limits.system_file_descriptors.max_files.toLocaleString()}</div>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="text-sm text-gray-600">Usage</div>
                <div className="text-lg font-semibold">{data.system_limits.system_file_descriptors.usage_percentage.toFixed(1)}%</div>
              </div>
            </div>
          </div>
        )}

        {/* Last Updated */}
        <div className="text-sm text-gray-500">
          Last updated: {formatTimestamp(data.timestamp)}
        </div>
      </CardContent>
    </Card>
  );
};

export default HandleMonitor;
