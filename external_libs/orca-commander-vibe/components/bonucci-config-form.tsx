'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

interface BonucciConfigFormProps {
  onCancel: () => void;
}

export function BonucciConfigForm({ onCancel }: BonucciConfigFormProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bonucci Bot Configuration</CardTitle>
        <CardDescription>
          Bonucci bot configuration is not yet available
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-8 space-y-4">
          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center">
            <AlertCircle className="h-8 w-8 text-yellow-600" />
          </div>
          <div className="text-center space-y-2">
            <h3 className="text-lg font-semibold">Coming Soon</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              The Bonucci bot algorithm is currently being developed and will be available in a future update.
              Please check back later or use the OrcaMax bot for now.
            </p>
          </div>
          <Button variant="outline" onClick={onCancel} className="mt-4">
            Go Back
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
