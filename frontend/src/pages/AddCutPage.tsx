import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Layout from '../components/Layout';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Switch } from '../components/ui/switch';
import { Plus, X, ArrowLeft, Scissors, RefreshCw } from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import { cutsApi, jobOrderApi } from '../services/api';
import SearchableDropdown from '../components/SearchableDropdown';

interface JobOrderItem {
  item_id: number;
  color_id: number;
  color_name: string;
  size_id: number;
  size_value: string;
  quantity: number;
}

interface JobOrder {
  job_order_id: number;
  job_order_number: string;
  model_name: string | null;
  client_id?: number | null;
  items: JobOrderItem[];
}

interface MaterialOption {
  material_id: number;
  material_name: string;
  fabric_code?: string | null;
  color_id?: number | null;
  color_name?: string | null;
  belongs_to_client: boolean;
}

const AddCutPage: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const editCutIdParam = searchParams.get('editCutId');
  const editingCutId = editCutIdParam ? parseInt(editCutIdParam, 10) : null;
  const isEditMode = Boolean(editingCutId);
  
  const [loading, setLoading] = useState(false);
  const [initialCutLoading, setInitialCutLoading] = useState(isEditMode);
  const [initialCutError, setInitialCutError] = useState<string | null>(null);
  const [cutReloadKey, setCutReloadKey] = useState(0);
  const [jobOrders, setJobOrders] = useState<Array<{job_order_id: number, job_order_number: string, model_name: string | null}>>([]);
  const [selectedJobOrderId, setSelectedJobOrderId] = useState<number | null>(null);
  const [jobOrder, setJobOrder] = useState<JobOrder | null>(null);
  const [selectedColorId, setSelectedColorId] = useState<number | null>(null);
  const [selectedMaterialId, setSelectedMaterialId] = useState<number | null>(null);
  const [includeNonClientMaterials, setIncludeNonClientMaterials] = useState(false);
  const [materialOptions, setMaterialOptions] = useState<MaterialOption[]>([]);
  const [ratios, setRatios] = useState<{ [item_id: string]: number }>({});
  const [wasteWeight, setWasteWeight] = useState<string>('');
  const [markerLength, setMarkerLength] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  
  // Rolls state
  const [rolls, setRolls] = useState<Array<{
    roll_number: number;
    weight: string;
    layer_weight: string;
    num_of_layers: string;
    roll_width: string;
  }>>([]);
  
  // Transitions state
  const [transitions, setTransitions] = useState<Array<{
    from_item_id: number;
    to_item_id: number;
    quantity: string;
    notes: string;
  }>>([]);

  const skipJobOrderResetRef = useRef(false);
  const getMaterialOptionLabel = (m: MaterialOption): string => {
    const colorPart = m.color_name ? ` - ${m.color_name}` : '';
    if (m.fabric_code) {
      return `${m.material_name} (${m.fabric_code}${colorPart})`;
    }
    return `${m.material_name}${colorPart} (No client fabric code)`;
  };
  const handleRetryLoadCut = () => {
    setInitialCutError(null);
    setInitialCutLoading(true);
    setCutReloadKey((prev) => prev + 1);
  };

  // Fetch job orders on mount
  useEffect(() => {
    const fetchJobOrders = async () => {
      try {
        const data = await jobOrderApi.getAllSimple();
        setJobOrders(data);
      } catch (error) {
        console.error('Error fetching job orders:', error);
        toast({
          title: 'Error',
          description: 'Failed to fetch job orders',
          variant: 'destructive',
        });
      }
    };
    fetchJobOrders();
  }, [toast]);

  // Fetch job order details when selected
  useEffect(() => {
    if (selectedJobOrderId) {
      const fetchJobOrder = async () => {
        try {
          const data = await jobOrderApi.getById(selectedJobOrderId);
          setJobOrder(data);
          if (skipJobOrderResetRef.current) {
            skipJobOrderResetRef.current = false;
          } else {
            setSelectedColorId(null);
            setRatios({});
          }
        } catch (error) {
          console.error('Error fetching job order:', error);
          toast({
            title: 'Error',
            description: 'Failed to fetch job order details',
            variant: 'destructive',
          });
        } finally {
          skipJobOrderResetRef.current = false;
        }
      };
      fetchJobOrder();
    } else {
      setJobOrder(null);
      setSelectedColorId(null);
      setRatios({});
    }
  }, [selectedJobOrderId, toast]);

  useEffect(() => {
    const fetchMaterialOptions = async () => {
      if (!selectedJobOrderId) {
        setMaterialOptions([]);
        setSelectedMaterialId(null);
        return;
      }
      try {
        const options = await jobOrderApi.getMaterialOptions(
          selectedJobOrderId,
          includeNonClientMaterials
        );
        setMaterialOptions(options);
      } catch (error) {
        console.error('Error fetching material options:', error);
        toast({
          title: 'Error',
          description: 'Failed to fetch materials for this client',
          variant: 'destructive',
        });
      }
    };
    fetchMaterialOptions();
  }, [selectedJobOrderId, includeNonClientMaterials, toast]);

  useEffect(() => {
    if (!materialOptions.length) {
      setSelectedMaterialId(null);
      return;
    }
    if (
      selectedMaterialId &&
      materialOptions.some(
        (opt) =>
          opt.material_id === selectedMaterialId &&
          (opt.color_id == null || selectedColorId == null || opt.color_id === selectedColorId)
      )
    ) {
      return;
    }
    const preferred = materialOptions.find((opt) => opt.belongs_to_client) || materialOptions[0];
    setSelectedMaterialId(preferred?.material_id ?? null);
    if (preferred?.color_id != null) {
      setSelectedColorId(preferred.color_id);
      setRatios({});
    }
  }, [materialOptions, selectedMaterialId, selectedColorId]);

  useEffect(() => {
    if (!isEditMode || !editingCutId) {
      setInitialCutLoading(false);
      setInitialCutError(null);
      return;
    }

    const fetchCutDetails = async () => {
      try {
        setInitialCutLoading(true);
        setInitialCutError(null);
        const existingCut = await cutsApi.getCutById(editingCutId);
        skipJobOrderResetRef.current = true;
        setSelectedJobOrderId(existingCut.job_order_id);
        setSelectedColorId(existingCut.color_id);
        const ratiosData = existingCut.job_order_items_ratios
          ? Object.entries(existingCut.job_order_items_ratios).reduce((acc, [key, value]) => {
              const numericValue = typeof value === 'number' ? value : parseFloat(String(value));
              acc[key] = Number.isNaN(numericValue) ? 0 : numericValue;
              return acc;
            }, {} as { [item_id: string]: number })
          : {};
        setRatios(ratiosData);
        setWasteWeight(
          existingCut.waste_fabric_weight !== null && existingCut.waste_fabric_weight !== undefined
            ? existingCut.waste_fabric_weight.toString()
            : ''
        );
        setMarkerLength(
          existingCut.marker_length !== null && existingCut.marker_length !== undefined
            ? existingCut.marker_length.toString()
            : ''
        );
        setNotes(existingCut.notes || '');
        setSelectedMaterialId(existingCut.material_id ?? null);
        setRolls(
          (existingCut.rolls || []).map((roll) => ({
            roll_number: roll.roll_number,
            weight: roll.weight !== null && roll.weight !== undefined ? roll.weight.toString() : '',
            layer_weight: roll.layer_weight !== null && roll.layer_weight !== undefined ? roll.layer_weight.toString() : '',
            num_of_layers: roll.num_of_layers !== null && roll.num_of_layers !== undefined ? roll.num_of_layers.toString() : '',
            roll_width: roll.roll_width !== null && roll.roll_width !== undefined ? roll.roll_width.toString() : '',
          }))
        );
        setTransitions(
          (existingCut.transitions || []).map((transition) => ({
            from_item_id: transition.from_item_id,
            to_item_id: transition.to_item_id,
            quantity: transition.quantity !== null && transition.quantity !== undefined ? transition.quantity.toString() : '',
            notes: transition.notes || '',
          }))
        );
      } catch (error: any) {
        console.error('Error loading cut details:', error);
        const errorMessage = error.response?.data?.detail || error.message || 'Failed to load cut details';
        setInitialCutError(errorMessage);
        toast({
          title: 'Error',
          description: errorMessage,
          variant: 'destructive',
        });
      } finally {
        setInitialCutLoading(false);
      }
    };

    fetchCutDetails();
  }, [isEditMode, editingCutId, toast, cutReloadKey]);

  // Get available colors for selected job order
  const availableColors = jobOrder
    ? Array.from(new Map(jobOrder.items.map(item => [item.color_id, item.color_name])).entries())
        .map(([id, name]) => ({ id, name }))
    : [];

  // Get items for selected color
  const colorItems = jobOrder && selectedColorId
    ? jobOrder.items.filter(item => item.color_id === selectedColorId)
    : [];

  const handleAddRoll = () => {
    const nextRollNumber = rolls.length > 0 ? Math.max(...rolls.map((roll) => roll.roll_number)) + 1 : 1;
    setRolls([...rolls, {
      roll_number: nextRollNumber,
      weight: '',
      layer_weight: '',
      num_of_layers: '',
      roll_width: '',
    }]);
  };

  const handleRemoveRoll = (index: number) => {
    setRolls(rolls.filter((_, i) => i !== index).map((roll, i) => ({
      ...roll,
      roll_number: i + 1,
    })));
  };

  const handleRollChange = (index: number, field: string, value: string) => {
    const updatedRolls = [...rolls];
    updatedRolls[index] = { ...updatedRolls[index], [field]: value };
    setRolls(updatedRolls);
  };

  const handleAddTransition = () => {
    if (!colorItems || colorItems.length < 2) {
      toast({
        title: 'Error',
        description: 'Need at least 2 sizes to create a transition',
        variant: 'destructive',
      });
      return;
    }
    setTransitions([...transitions, {
      from_item_id: colorItems[0].item_id,
      to_item_id: colorItems[1].item_id,
      quantity: '',
      notes: '',
    }]);
  };

  const handleRemoveTransition = (index: number) => {
    setTransitions(transitions.filter((_, i) => i !== index));
  };

  const handleTransitionChange = (index: number, field: string, value: string | number) => {
    const updatedTransitions = [...transitions];
    updatedTransitions[index] = { ...updatedTransitions[index], [field]: value };
    setTransitions(updatedTransitions);
  };

  const handleRatioChange = (itemId: number, value: string) => {
    const numValue = parseFloat(value) || 0;
    setRatios({ ...ratios, [itemId.toString()]: numValue });
  };

  const handleSubmit = async () => {
    if (!selectedJobOrderId || !selectedColorId || !selectedMaterialId) {
      toast({
        title: 'Error',
        description: 'Please select a job order, material, and color',
        variant: 'destructive',
      });
      return;
    }

    if (Object.keys(ratios).length === 0) {
      toast({
        title: 'Error',
        description: 'Please enter at least one ratio',
        variant: 'destructive',
      });
      return;
    }

    // Validate rolls
    for (const roll of rolls) {
      if (!roll.weight || !roll.layer_weight || !roll.num_of_layers) {
        toast({
          title: 'Error',
          description: 'Please fill in all roll fields',
          variant: 'destructive',
        });
        return;
      }
    }

    // Validate transitions
    for (const transition of transitions) {
      if (!transition.quantity || transition.from_item_id === transition.to_item_id) {
        toast({
          title: 'Error',
          description: 'Please fill in all transition fields and ensure from/to are different',
          variant: 'destructive',
        });
        return;
      }
    }

    try {
      setLoading(true);
      
      const cutData = {
        job_order_id: selectedJobOrderId,
        color_id: selectedColorId,
        material_id: selectedMaterialId ?? undefined,
        job_order_items_ratios: ratios,
        waste_fabric_weight: wasteWeight ? parseFloat(wasteWeight) : undefined,
        marker_length: markerLength ? parseFloat(markerLength) : undefined,
        notes: notes || undefined,
        rolls: rolls.map(roll => ({
          roll_number: roll.roll_number,
          weight: parseFloat(roll.weight),
          layer_weight: parseFloat(roll.layer_weight),
          num_of_layers: parseInt(roll.num_of_layers),
          roll_width: roll.roll_width ? parseFloat(roll.roll_width) : undefined,
        })),
        transitions: transitions.map(transition => ({
          from_item_id: transition.from_item_id,
          to_item_id: transition.to_item_id,
          quantity: parseInt(transition.quantity),
          notes: transition.notes || undefined,
        })),
      };

      const savedCut = isEditMode && editingCutId
        ? await cutsApi.updateCut(editingCutId, cutData)
        : await cutsApi.createCut(cutData);
      
      toast({
        title: 'Success',
        description: isEditMode ? 'Cut updated successfully' : 'Cut created successfully',
      });
      
      navigate(`/cutting/${savedCut.cut_id}`);
    } catch (error: any) {
      console.error(isEditMode ? 'Error updating cut:' : 'Error creating cut:', error);
      const fallbackMessage = isEditMode ? 'Failed to update cut' : 'Failed to create cut';
      const errorMessage = error.response?.data?.detail || error.message || fallbackMessage;
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (initialCutLoading) {
    return (
      <Layout>
        <div className="p-6 min-h-screen flex items-center justify-center">
          <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </Layout>
    );
  }

  if (initialCutError) {
    return (
      <Layout>
        <div className="p-6 min-h-screen flex items-center justify-center">
          <Card className="max-w-md w-full">
            <CardHeader>
              <CardTitle>Error Loading Cut</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600">{initialCutError}</p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => navigate('/cutting')}>
                  Back to Cuts
                </Button>
                <Button onClick={handleRetryLoadCut}>
                  Retry
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const pageTitle = isEditMode ? 'Edit Cut' : 'Create New Cut';
  const pageDescription = isEditMode
    ? 'Update cut details including ratios, rolls, and transitions'
    : 'Enter cut details including ratios, rolls, and transitions';

  const primaryButtonLabel = isEditMode ? 'Save Changes' : 'Create Cut';
  const primaryButtonLoadingLabel = isEditMode ? 'Saving...' : 'Creating...';

  return (
    <Layout>
      <div className="p-6 min-h-screen">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <Button
              onClick={() => navigate('/cutting')}
              variant="outline"
              className="mb-4"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Cuts
            </Button>
            
            <div className="flex items-center gap-3 mb-2">
              <Scissors className="w-8 h-8 text-green" />
              <h1 className="text-3xl font-bold text-gray-800">{pageTitle}</h1>
            </div>
            <p className="text-gray-600">{pageDescription}</p>
          </div>

          <div className="space-y-6">
            {/* Job Order Selection */}
            <Card>
              <CardHeader>
                <CardTitle>Job Order & Color</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="job-order">Job Order *</Label>
                  <SearchableDropdown
                    options={jobOrders.map(jo => `${jo.job_order_number}${jo.model_name ? ` - ${jo.model_name}` : ''}`)}
                    value={selectedJobOrderId ? (() => {
                      const found = jobOrders.find(jo => jo.job_order_id === selectedJobOrderId);
                      return found ? `${found.job_order_number}${found.model_name ? ` - ${found.model_name}` : ''}` : '';
                    })() : ''}
                    onChange={(value) => {
                      const found = jobOrders.find(jo => `${jo.job_order_number}${jo.model_name ? ` - ${jo.model_name}` : ''}` === value);
                      setSelectedJobOrderId(found ? found.job_order_id : null);
                    }}
                    placeholder="Select a job order"
                    label=""
                  />
                </div>

                {jobOrder && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="material">Material *</Label>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <span>Show non-client materials</span>
                        <Switch
                          checked={includeNonClientMaterials}
                          onCheckedChange={setIncludeNonClientMaterials}
                        />
                      </div>
                    </div>
                    <SearchableDropdown
                      options={materialOptions.map((m) => getMaterialOptionLabel(m))}
                      value={(() => {
                        const found = materialOptions.find(
                          (m) =>
                            m.material_id === selectedMaterialId &&
                            (m.color_id == null || selectedColorId == null || m.color_id === selectedColorId)
                        );
                        if (!found) return '';
                        return getMaterialOptionLabel(found);
                      })()}
                      onChange={(value) => {
                        const found = materialOptions.find((m) => getMaterialOptionLabel(m) === value);
                        if (!found) {
                          setSelectedMaterialId(null);
                          return;
                        }
                        setSelectedMaterialId(found.material_id);
                        if (found.color_id != null) {
                          setSelectedColorId(found.color_id);
                          setRatios({});
                        }
                      }}
                      placeholder="Select material"
                      label=""
                    />
                  </div>
                )}

                {jobOrder && (
                  <div>
                    <Label htmlFor="color">Color *</Label>
                    <SearchableDropdown
                      options={availableColors.map(c => c.name)}
                      value={selectedColorId ? availableColors.find(c => c.id === selectedColorId)?.name || '' : ''}
                      onChange={(value) => {
                        const found = availableColors.find(c => c.name === value);
                        setSelectedColorId(found ? found.id : null);
                        setRatios({});
                      }}
                      placeholder="Select a color"
                      label=""
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Ratios */}
            {colorItems.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Size Ratios (Pieces per Layer) *</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {colorItems.map((item) => (
                    <div key={item.item_id} className="flex items-center gap-4">
                      <Label className="w-24">{item.size_value}</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        value={ratios[item.item_id.toString()] ?? ''}
                        onChange={(e) => handleRatioChange(item.item_id, e.target.value)}
                        placeholder="Ratio"
                        className="flex-1"
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Rolls */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Rolls</CardTitle>
                  <Button onClick={handleAddRoll} size="sm" variant="outline">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Roll
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {rolls.length === 0 ? (
                  <p className="text-gray-500 text-sm">No rolls added. Click "Add Roll" to add one.</p>
                ) : (
                  rolls.map((roll, index) => (
                    <div key={index} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">Roll #{roll.roll_number}</span>
                        <Button
                          onClick={() => handleRemoveRoll(index)}
                          size="sm"
                          variant="ghost"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-4 gap-3">
                        <div>
                          <Label>Weight (kg)</Label>
                          <Input
                            type="number"
                            step="0.001"
                            min="0"
                            value={roll.weight}
                            onChange={(e) => handleRollChange(index, 'weight', e.target.value)}
                            placeholder="0.000"
                          />
                        </div>
                        <div>
                          <Label>Layer Weight (kg)</Label>
                          <Input
                            type="number"
                            step="0.001"
                            min="0"
                            value={roll.layer_weight}
                            onChange={(e) => handleRollChange(index, 'layer_weight', e.target.value)}
                            placeholder="0.000"
                          />
                        </div>
                        <div>
                          <Label>Number of Layers</Label>
                          <Input
                            type="number"
                            step="1"
                            min="1"
                            value={roll.num_of_layers}
                            onChange={(e) => handleRollChange(index, 'num_of_layers', e.target.value)}
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <Label>Roll Width (M)</Label>
                          <Input
                            type="number"
                            step="0.001"
                            min="0"
                            value={roll.roll_width}
                            onChange={(e) => handleRollChange(index, 'roll_width', e.target.value)}
                            placeholder="0.000"
                          />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Size Transitions */}
            {colorItems.length >= 2 && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Size Transitions</CardTitle>
                    <Button onClick={handleAddTransition} size="sm" variant="outline">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Transition
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {transitions.length === 0 ? (
                    <p className="text-gray-500 text-sm">No transitions added. Click "Add Transition" to add one.</p>
                  ) : (
                    transitions.map((transition, index) => (
                      <div key={index} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">Transition #{index + 1}</span>
                          <Button
                            onClick={() => handleRemoveTransition(index)}
                            size="sm"
                            variant="ghost"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <Label>From Size</Label>
                            <SearchableDropdown
                              options={colorItems.map(item => item.size_value)}
                              value={colorItems.find(item => item.item_id === transition.from_item_id)?.size_value || ''}
                              onChange={(value) => {
                                const found = colorItems.find(item => item.size_value === value);
                                if (found) {
                                  handleTransitionChange(index, 'from_item_id', found.item_id);
                                }
                              }}
                              placeholder="Select size"
                              label=""
                            />
                          </div>
                          <div>
                            <Label>To Size</Label>
                            <SearchableDropdown
                              options={colorItems.map(item => item.size_value)}
                              value={colorItems.find(item => item.item_id === transition.to_item_id)?.size_value || ''}
                              onChange={(value) => {
                                const found = colorItems.find(item => item.size_value === value);
                                if (found) {
                                  handleTransitionChange(index, 'to_item_id', found.item_id);
                                }
                              }}
                              placeholder="Select size"
                              label=""
                            />
                          </div>
                          <div>
                            <Label>Quantity</Label>
                            <Input
                              type="number"
                              step="1"
                              min="1"
                              value={transition.quantity}
                              onChange={(e) => handleTransitionChange(index, 'quantity', e.target.value)}
                              placeholder="0"
                            />
                          </div>
                        </div>
                        <div>
                          <Label>Notes</Label>
                          <Input
                            value={transition.notes}
                            onChange={(e) => handleTransitionChange(index, 'notes', e.target.value)}
                            placeholder="Optional notes"
                          />
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            )}

            {/* Additional Info */}
            <Card>
              <CardHeader>
                <CardTitle>Additional Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="waste-weight">Waste Fabric Weight (kg)</Label>
                  <Input
                    id="waste-weight"
                    type="number"
                    step="0.001"
                    min="0"
                    value={wasteWeight}
                    onChange={(e) => setWasteWeight(e.target.value)}
                    placeholder="0.000"
                  />
                </div>
                <div>
                  <Label htmlFor="marker-length">Marker Length (M)</Label>
                  <Input
                    id="marker-length"
                    type="number"
                    step="0.001"
                    min="0"
                    value={markerLength}
                    onChange={(e) => setMarkerLength(e.target.value)}
                    placeholder="0.000"
                  />
                </div>
                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional notes about this cut"
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <Button
                onClick={() => navigate('/cutting')}
                variant="outline"
                disabled={loading}
              >
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={loading}>
                {loading ? primaryButtonLoadingLabel : primaryButtonLabel}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default AddCutPage;

