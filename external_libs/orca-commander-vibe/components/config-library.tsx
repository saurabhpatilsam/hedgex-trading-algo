'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
// import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { 
  Search, 
  Filter, 
  Copy, 
  Play, 
  Edit, 
  Heart,
  Star,
  Clock,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Settings,
  Database,
  Hash,
  DollarSign,
  Activity,
  BookOpen,
  Sparkles,
  ChevronRight,
  Archive,
  RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { OrcaMaxConfig, BonucciConfig } from '@/lib/types';

interface BotConfiguration {
  id: string;
  name: string;
  description?: string;
  bot_type: 'orcamax' | 'bonucci' | 'fibonacci';
  config: OrcaMaxConfig | BonucciConfig | any;
  created_at: string;
  last_used?: string;
  times_used: number;
  success_rate?: number;
  total_pnl?: number;
  tags?: string[];
  is_favorite?: boolean;
  is_archived?: boolean;
  created_by?: string;
  status?: 'active' | 'archived' | 'draft';
  performance_metrics?: {
    win_rate?: number;
    avg_pnl?: number;
    total_trades?: number;
    best_day?: number;
    worst_day?: number;
  };
}

interface ConfigLibraryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectConfig?: (config: BotConfiguration) => void;
  onRunConfig?: (config: BotConfiguration) => void;
  onEditConfig?: (config: BotConfiguration) => void;
  configurations?: BotConfiguration[];
}

export function ConfigLibrary({
  open,
  onOpenChange,
  onSelectConfig,
  onRunConfig,
  onEditConfig,
  configurations: propConfigurations
}: ConfigLibraryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('recent');
  const [configurations, setConfigurations] = useState<BotConfiguration[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedConfig, setSelectedConfig] = useState<BotConfiguration | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingConfig, setEditingConfig] = useState<BotConfiguration | null>(null);

  // Fetch configurations
  useEffect(() => {
    const fetchConfigurations = async () => {
      try {
        setLoading(true);
        // If configurations are passed as props, use them
        if (propConfigurations) {
          setConfigurations(propConfigurations);
        } else {
          // Otherwise fetch from API
          const response = await fetch('/api/bot-configurations');
          if (response.ok) {
            const data = await response.json();
            setConfigurations(data.configurations || []);
          }
        }
      } catch (error) {
        console.error('Failed to fetch configurations:', error);
        // Use mock data for demonstration
        setConfigurations(getMockConfigurations());
      } finally {
        setLoading(false);
      }
    };

    if (open) {
      fetchConfigurations();
    }
  }, [open, propConfigurations]);

  // Filter and sort configurations
  const filteredConfigs = configurations
    .filter(config => {
      if (searchQuery && !config.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
          !config.description?.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      if (selectedType !== 'all' && config.bot_type !== selectedType) {
        return false;
      }
      if (selectedTag !== 'all' && !config.tags?.includes(selectedTag)) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'recent':
          return new Date(b.last_used || b.created_at).getTime() - 
                 new Date(a.last_used || a.created_at).getTime();
        case 'popular':
          return b.times_used - a.times_used;
        case 'performance':
          return (b.success_rate || 0) - (a.success_rate || 0);
        case 'alphabetical':
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });

  // Get unique tags
  const allTags = Array.from(new Set(configurations.flatMap(c => c.tags || [])));

  const handleRunConfig = (config: BotConfiguration) => {
    if (onRunConfig) {
      onRunConfig(config);
      onOpenChange(false);
    }
  };

  const handleEditConfig = (config: BotConfiguration) => {
    setEditingConfig(config);
    setShowEditDialog(true);
  };

  const handleDuplicateConfig = async (config: BotConfiguration) => {
    const newConfig = {
      ...config,
      id: `${config.id}_copy_${Date.now()}`,
      name: `${config.name} (Copy)`,
      created_at: new Date().toISOString(),
      times_used: 0,
      is_favorite: false,
    };
    
    setConfigurations([newConfig, ...configurations]);
    toast.success('Configuration duplicated successfully');
  };

  const handleToggleFavorite = async (config: BotConfiguration) => {
    const updatedConfigs = configurations.map(c =>
      c.id === config.id ? { ...c, is_favorite: !c.is_favorite } : c
    );
    setConfigurations(updatedConfigs);
    toast.success(config.is_favorite ? 'Removed from favorites' : 'Added to favorites');
  };

  const getBotTypeIcon = (type: string) => {
    switch (type) {
      case 'orcamax':
        return <TrendingUp className="h-4 w-4" />;
      case 'bonucci':
        return <Activity className="h-4 w-4" />;
      case 'fibonacci':
        return <Hash className="h-4 w-4" />;
      default:
        return <Settings className="h-4 w-4" />;
    }
  };

  const getBotTypeColor = (type: string) => {
    switch (type) {
      case 'orcamax':
        return 'text-blue-500 bg-blue-500/10 border-blue-500/30';
      case 'bonucci':
        return 'text-purple-500 bg-purple-500/10 border-purple-500/30';
      case 'fibonacci':
        return 'text-green-500 bg-green-500/10 border-green-500/30';
      default:
        return 'text-gray-500 bg-gray-500/10 border-gray-500/30';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[85vh] p-0 gap-0 border-primary/20 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <DialogHeader className="p-6 pb-4 border-b border-white/5">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-white via-blue-100 to-blue-200 bg-clip-text text-transparent">
                Configuration Library
              </DialogTitle>
              <DialogDescription className="mt-1">
                Browse, manage, and deploy your bot configurations
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs border-primary/30 bg-primary/5">
                {configurations.length} Configurations
              </Badge>
              <Badge variant="outline" className="text-xs border-emerald-500/30 bg-emerald-500/5 text-emerald-400">
                {configurations.filter(c => c.is_favorite).length} Favorites
              </Badge>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Filters and Search Bar */}
          <div className="p-6 py-4 border-b border-white/5 space-y-4">
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search configurations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Bot Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="orcamax">OrcaMax</SelectItem>
                  <SelectItem value="bonucci">Bonucci</SelectItem>
                  <SelectItem value="fibonacci">Fibonacci</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Sort By" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Most Recent</SelectItem>
                  <SelectItem value="popular">Most Used</SelectItem>
                  <SelectItem value="performance">Best Performance</SelectItem>
                  <SelectItem value="alphabetical">Alphabetical</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tags Filter */}
            {allTags.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Tags:</span>
                <div className="flex gap-2">
                  <Button
                    variant={selectedTag === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedTag('all')}
                    className="h-7"
                  >
                    All
                  </Button>
                  {allTags.map(tag => (
                    <Button
                      key={tag}
                      variant={selectedTag === tag ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedTag(tag)}
                      className="h-7"
                    >
                      {tag}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Configurations Grid */}
          <div className="flex-1 p-6 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Loading configurations...</span>
              </div>
            ) : filteredConfigs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64">
                <Database className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">No configurations found</p>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  {searchQuery ? 'Try adjusting your search criteria' : 'Create your first configuration to get started'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredConfigs.map((config) => (
                  <Card 
                    key={config.id}
                    className={cn(
                      "group relative overflow-hidden transition-all duration-300",
                      "hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/10",
                      "border-white/5 bg-gradient-to-br from-slate-900/90 via-slate-800/90 to-slate-900/90"
                    )}
                  >
                    {/* Favorite Badge */}
                    {config.is_favorite && (
                      <div className="absolute top-3 right-3 z-10">
                        <Star className="h-5 w-5 fill-yellow-500 text-yellow-500" />
                      </div>
                    )}

                    <CardHeader className="pb-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg flex items-center gap-2">
                            <span className="truncate">{config.name}</span>
                          </CardTitle>
                          <CardDescription className="mt-1 line-clamp-2">
                            {config.description || 'No description available'}
                          </CardDescription>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mt-3">
                        <Badge variant="outline" className={cn("text-xs", getBotTypeColor(config.bot_type))}>
                          <span className="flex items-center gap-1">
                            {getBotTypeIcon(config.bot_type)}
                            {config.bot_type.toUpperCase()}
                          </span>
                        </Badge>
                        {config.tags?.map(tag => (
                          <Badge key={tag} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      {/* Performance Metrics */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground">Used</p>
                          <p className="text-sm font-semibold">{config.times_used} times</p>
                        </div>
                        {config.success_rate !== undefined && (
                          <div>
                            <p className="text-xs text-muted-foreground">Success Rate</p>
                            <p className={cn(
                              "text-sm font-semibold",
                              config.success_rate >= 70 ? "text-green-500" :
                              config.success_rate >= 50 ? "text-yellow-500" :
                              "text-red-500"
                            )}>
                              {config.success_rate}%
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Last Used */}
                      {config.last_used && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          Last used {new Date(config.last_used).toLocaleDateString()}
                        </div>
                      )}

                      {/* Configuration Details Preview */}
                      <div className="space-y-1 p-3 rounded-lg bg-black/20 border border-white/5">
                        <p className="text-xs font-medium text-muted-foreground mb-2">Configuration</p>
                        {config.config && (
                          <div className="space-y-1 text-xs">
                            {config.config.instrument && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Instrument:</span>
                                <span className="font-mono">{config.config.instrument}</span>
                              </div>
                            )}
                            {config.config.quantity !== undefined && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Quantity:</span>
                                <span className="font-mono">{config.config.quantity}</span>
                              </div>
                            )}
                            {config.config.point_strategy_key && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Point Strategy:</span>
                                <span className="font-mono text-[10px]">{config.config.point_strategy_key.slice(0, 20)}...</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </CardContent>

                    <CardFooter className="pt-3 gap-2">
                      <Button
                        size="sm"
                        className="flex-1 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-600"
                        onClick={() => handleRunConfig(config)}
                      >
                        <Play className="h-3 w-3 mr-1" />
                        Deploy
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEditConfig(config)}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDuplicateConfig(config)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleToggleFavorite(config)}
                      >
                        <Heart className={cn(
                          "h-3 w-3",
                          config.is_favorite && "fill-current text-rose-500"
                        )} />
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Mock data for demonstration
function getMockConfigurations(): BotConfiguration[] {
  return [
    {
      id: 'config_1',
      name: 'High Frequency Scalper',
      description: 'Aggressive scalping strategy for volatile markets',
      bot_type: 'orcamax',
      config: {
        instrument: 'NQ',
        quantity: 2,
        point_strategy_key: 'aggressive_scalp_v2',
        exit_strategy_key: 'quick_exit_1min',
      },
      created_at: '2024-01-15T10:00:00Z',
      last_used: '2024-01-20T14:30:00Z',
      times_used: 45,
      success_rate: 78,
      tags: ['scalping', 'high-frequency', 'volatile'],
      is_favorite: true,
    },
    {
      id: 'config_2',
      name: 'Conservative Swing Trader',
      description: 'Low risk swing trading with tight stop losses',
      bot_type: 'bonucci',
      config: {
        instrument: 'ES',
        quantity: 1,
        risk_percentage: 0.5,
      },
      created_at: '2024-01-10T08:00:00Z',
      last_used: '2024-01-19T09:00:00Z',
      times_used: 23,
      success_rate: 65,
      tags: ['swing', 'conservative', 'low-risk'],
      is_favorite: false,
    },
    {
      id: 'config_3',
      name: 'Fibonacci Retracement Pro',
      description: 'Advanced fibonacci levels with dynamic adjustments',
      bot_type: 'fibonacci',
      config: {
        instrument: 'YM',
        quantity: 1,
        fibonacci_levels: {
          '0.236': 5,
          '0.382': 8,
          '0.5': 10,
          '0.618': 12,
        },
      },
      created_at: '2024-01-05T12:00:00Z',
      times_used: 12,
      success_rate: 82,
      tags: ['fibonacci', 'technical', 'retracement'],
      is_favorite: true,
    },
  ];
}
