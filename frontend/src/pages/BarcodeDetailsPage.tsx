import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { barcodeApi, BarcodeData, TimelineSummaryResponse, TimelineSummaryEntry, BarcodeScanEvent } from '../services/api';
import { Button } from '../components/ui/button';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';

const BarcodeDetailsPage: React.FC = () => {
  const { batchId } = useParams<{ batchId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [barcodeData, setBarcodeData] = useState<BarcodeData | null>(null);
  const [timelineData, setTimelineData] = useState<TimelineSummaryResponse | null>(null);
  const [scanEvents, setScanEvents] = useState<BarcodeScanEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBarcodeData(null);
    setTimelineData(null);
    setScanEvents([]);
    setError(null);
    setLoading(true);
    const fetchData = async () => {
      try {
        const data = await barcodeApi.getBatchById(batchId);
        setBarcodeData(data);
        
        // Fetch event-based timeline data
        setTimelineLoading(true);
        try {
          const [timeline, events] = await Promise.all([
            barcodeApi.getBatchTimelineSummary(parseInt(batchId)),
            barcodeApi.getBatchScanEvents(parseInt(batchId))
          ]);
          setTimelineData(timeline);
          setScanEvents(events);
        } catch (timelineErr) {
          console.error('Timeline fetch error:', timelineErr);
          // Don't show error for timeline, just log it
        } finally {
          setTimelineLoading(false);
        }
      } catch (err) {
        console.error('BarcodeDetailsPage: fetch error', err);
        setError(t('barcode.notFound'));
      } finally {
        setLoading(false);
      }
    };
    if (batchId) fetchData();
  }, [batchId, t]);

  // PHASES array for mapping phase id to name
  const PHASES = [
    { id: 1, name: 'Cutting' },
    { id: 2, name: 'Sewing' },
    { id: 3, name: 'Packaging' }
  ];

  function getPhaseName(phaseId: number, t: any) {
    const phase = PHASES.find(p => p.id === phaseId);
    return phase ? t(`phases.${phase.name.toLowerCase()}`) : phaseId;
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'In Progress':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Completed':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'Quantity Update':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatDuration = (minutes: number | undefined) => {
    if (!minutes) return 'N/A';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const TimelineItem: React.FC<{ entry: TimelineSummaryEntry; isLast: boolean }> = ({ entry, isLast }) => (
    <div className="relative flex items-start space-x-4">
      {/* Timeline line */}
      <div className="flex flex-col items-center">
        <div className={`w-3 h-3 rounded-full border-2 border-white shadow-sm ${
          entry.status === 'Completed' ? 'bg-orange-500' :
          entry.status === 'In Progress' ? 'bg-blue-500' :
          'bg-yellow-500'
        }`} />
        {!isLast && (
          <div className="w-0.5 h-16 bg-gray-200 mt-2" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <Badge className={getStatusColor(entry.status)}>
                {entry.status}
              </Badge>
              <span className="text-sm font-medium text-gray-900">
                {entry.phase_name}
              </span>
              <Badge variant="outline" className="text-xs">
                {entry.event_count} events
              </Badge>
            </div>
            <span className="text-xs text-gray-500">
              {entry.start_time ? formatDateTime(entry.start_time) : 'N/A'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Start Time:</span>
              <span className="ml-1 font-medium">{entry.start_time ? formatDateTime(entry.start_time) : 'N/A'}</span>
            </div>
            <div>
              <span className="text-gray-500">Quantity at Start:</span>
              <span className="ml-1 font-medium">{entry.quantity_at_start || 'N/A'}</span>
            </div>
            {entry.end_time && (
              <>
                <div>
                  <span className="text-gray-500">End Time:</span>
                  <span className="ml-1 font-medium">{formatDateTime(entry.end_time)}</span>
                </div>
                <div>
                  <span className="text-gray-500">Duration:</span>
                  <span className="ml-1 font-medium">{formatDuration(entry.duration_minutes)}</span>
                </div>
                <div>
                  <span className="text-gray-500">Quantity at End:</span>
                  <span className="ml-1 font-medium">{entry.quantity_at_end || 'N/A'}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold mb-2 text-gray-800">
          {t('barcode.detailsTitle')}
        </h1>
        <Button variant="outline" onClick={() => navigate(-1)}>
          {t('common.back')}
        </Button>
      </div>
      
      {loading ? (
        <div className="text-center py-10">
          <div className="w-12 h-12 border-4 border-green border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-600">{t('barcode.loadingDetails')}</p>
        </div>
      ) : error ? (
        <div className="text-center py-10 text-red-600">{error}</div>
      ) : barcodeData ? (
        <div className="space-y-6">
          {/* Barcode Details Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <span>📊 {t('barcode.detailsTitle')}</span>
                <Badge 
                  variant="outline" 
                  className={barcodeData.is_second_degree ? 'bg-red-500 text-white border-red-500' : ''}
                >
                  {barcodeData.barcode}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-1">{t('barcode.jobOrderNumber')}</h4>
                  <p className="text-lg font-semibold text-gray-900">{barcodeData.job_order_number || 'N/A'}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-1">{t('barcode.client')}</h4>
                  <p className="text-lg font-semibold text-gray-900">{barcodeData.client_name}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-1">{t('barcode.model')}</h4>
                  <p className="text-lg font-semibold text-gray-900">{barcodeData.model_name}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-1">{t('barcode.color')}</h4>
                  <p className="text-lg font-semibold text-gray-900">{barcodeData.color_name}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-1">{t('barcode.quantity')}</h4>
                  <p className="text-lg font-semibold text-gray-900">{barcodeData.quantity}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-1">{t('barcode.size')}</h4>
                  <p className="text-lg font-semibold text-gray-900">{barcodeData.size_value}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-1">{t('barcode.layers')}</h4>
                  <p className="text-lg font-semibold text-gray-900">{barcodeData.layers}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-1">{t('barcode.serial')}</h4>
                  <p className="text-lg font-semibold text-gray-900">{barcodeData.serial}</p>
                </div>
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-2 rounded">
                  <h4 className="text-sm font-medium text-gray-500 mb-1">{t('barcode.phase')}</h4>
                  <p className="text-lg font-semibold text-gray-900">{barcodeData.phase_name}</p>
                </div>
                <div className="bg-blue-50 border-l-4 border-blue-400 p-2 rounded">
                  <h4 className="text-sm font-medium text-gray-500 mb-1">{t('common.status')}</h4>
                  <p className="text-lg font-semibold text-gray-900">{barcodeData.status}</p>
                </div>
              </div>
              
              {barcodeData.notes && (
                <div className="bg-gradient-to-r from-green-100 to-green-50 border-l-8 border-green-500 p-4 rounded-lg shadow flex items-start gap-3 mt-4">
                  <span className="mt-1 text-green-600">
                    <svg xmlns='http://www.w3.org/2000/svg' className='h-6 w-6' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                      <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M13 16h-1v-4h-1m1-4h.01M12 20a8 8 0 100-16 8 8 0 000 16z' />
                    </svg>
                  </span>
                  <div>
                    <h4 className="text-base font-semibold text-green-800 mb-1">{t('jobOrderDetails.notes')}</h4>
                    <p className="text-lg font-bold text-green-900 whitespace-pre-line">{barcodeData.notes}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Timeline Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <span>📈 Timeline History</span>
                {timelineData && (
                  <Badge variant="secondary">
                    {timelineData.total_events} events
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="summary" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="summary">Summary View</TabsTrigger>
                  <TabsTrigger value="events">Detailed Events</TabsTrigger>
                </TabsList>
                
                <TabsContent value="summary">
                  {timelineLoading ? (
                    <div className="text-center py-8">
                      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                      <p className="text-gray-600 text-sm">Loading timeline...</p>
                    </div>
                  ) : timelineData && timelineData.timeline_entries.length > 0 ? (
                    <div className="space-y-4">
                      {timelineData.timeline_entries.map((entry, index) => (
                        <TimelineItem
                          key={`${entry.phase_id}-${entry.status}`}
                          entry={entry}
                          isLast={index === timelineData.timeline_entries.length - 1}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <div className="w-12 h-12 mx-auto mb-3 text-gray-300">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <p>No timeline data available</p>
                      <p className="text-sm">Timeline entries will appear here as the barcode progresses through phases</p>
                    </div>
                  )}
                </TabsContent>
                
                <TabsContent value="events">
                  {timelineLoading ? (
                    <div className="text-center py-8">
                      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                      <p className="text-gray-600 text-sm">Loading events...</p>
                    </div>
                  ) : scanEvents.length > 0 ? (
                    <div className="space-y-3">
                      {scanEvents.map((event, index) => (
                        <div key={event.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center space-x-2">
                              <Badge className={
                                event.action_type === 'scan_in' ? 'bg-blue-100 text-blue-800' :
                                event.action_type === 'scan_out' ? 'bg-green-100 text-green-800' :
                                event.action_type === 'quantity_update' ? 'bg-purple-100 text-purple-800' :
                                event.action_type === 'second_degree_update' ? 'bg-orange-100 text-orange-800' :
                                'bg-gray-100 text-gray-800'
                              }>
                                {event.action_type.replace('_', ' ').toUpperCase()}
                              </Badge>
                              <span className="text-sm font-medium text-gray-900">
                                {event.phase_name || `Phase ${event.phase_id}`}
                              </span>
                            </div>
                            <span className="text-xs text-gray-500">
                              {formatDateTime(event.scanned_at)}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            {event.old_status && event.new_status && (
                              <div>
                                <span className="text-gray-500">Status:</span>
                                <span className="ml-1 font-medium">{event.old_status} → {event.new_status}</span>
                              </div>
                            )}
                            {event.old_quantity !== undefined && event.new_quantity !== undefined && (
                              <div>
                                <span className="text-gray-500">Quantity:</span>
                                <span className="ml-1 font-medium">{event.old_quantity} → {event.new_quantity}</span>
                              </div>
                            )}
                            {event.user_name && (
                              <div>
                                <span className="text-gray-500">User:</span>
                                <span className="ml-1 font-medium">{event.user_name}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <div className="w-12 h-12 mx-auto mb-3 text-gray-300">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <p>No scan events available</p>
                      <p className="text-sm">Scan events will appear here as the barcode is processed</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </Layout>
  );
};

export default BarcodeDetailsPage; 