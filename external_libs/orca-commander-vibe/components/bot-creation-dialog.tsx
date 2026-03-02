'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { BotType } from '@/lib/types';
import { Bot, Zap } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface BotCreationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBotTypeSelect: (type: BotType) => void;
}

export function BotCreationDialog({ open, onOpenChange, onBotTypeSelect }: BotCreationDialogProps) {
  const handleSelectType = (type: BotType) => {
    onBotTypeSelect(type);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Create New Trading Bot</DialogTitle>
          <DialogDescription>
            Choose the type of trading bot you want to deploy
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
          {/* OrcaMax Bot */}
          <Card 
            className="cursor-pointer hover:border-primary hover:shadow-lg transition-all"
            onClick={() => handleSelectType('orcamax')}
          >
            <CardHeader>
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Zap className="h-5 w-5 text-blue-600" />
                </div>
                <CardTitle className="text-lg">OrcaMax</CardTitle>
              </div>
              <CardDescription>
                Advanced momentum-based trading strategy with configurable entry/exit points
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• Multiple contract types</li>
                <li>• Breakthrough & Reverse modes</li>
                <li>• Point strategy configuration</li>
                <li>• Environment selection</li>
              </ul>
              <Button className="w-full mt-4" onClick={() => handleSelectType('orcamax')}>
                Configure OrcaMax
              </Button>
            </CardContent>
          </Card>

          {/* Bonucci Bot */}
          <Card 
            className="cursor-pointer hover:border-primary hover:shadow-lg transition-all opacity-60"
            onClick={() => handleSelectType('bonucci')}
          >
            <CardHeader>
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Bot className="h-5 w-5 text-purple-600" />
                </div>
                <CardTitle className="text-lg">Bonucci</CardTitle>
              </div>
              <CardDescription>
                Coming soon - Advanced algorithmic trading strategy
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• Under development</li>
                <li>• Available in future release</li>
                <li>• Check back soon</li>
              </ul>
              <Button 
                className="w-full mt-4" 
                variant="secondary" 
                disabled
              >
                Coming Soon
              </Button>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
