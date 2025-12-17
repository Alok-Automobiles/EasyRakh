'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Phone, Mail, MapPin, Pencil, Trash2, User } from 'lucide-react';

interface EntityCardProps {
  entity: {
    id: string;
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    totalBalance: number;
  };
  entityType: string;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function EntityCard({ entity, entityType, onEdit, onDelete }: EntityCardProps) {
  const router = useRouter();
  
  const isPositive = entity.totalBalance >= 0;
  const displayBalance = Math.abs(entity.totalBalance);

  const handleCardClick = () => {
    router.push(`/ledger/${entityType}/${entity.id}`);
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(entity.id);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(entity.id);
  };

  return (
    <Card 
      className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1 bg-gradient-to-br from-card to-card/80 border-border/50"
      onClick={handleCardClick}
    >
      <CardContent className="p-5">
        {/* Action Buttons - Always visible */}
        <div className="absolute top-3 right-3 flex items-center gap-1">
          <Button
            onClick={handleEditClick}
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 hover:text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 transition-colors"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            onClick={handleDeleteClick}
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full bg-rose-100 text-rose-600 hover:bg-rose-200 hover:text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 dark:hover:bg-rose-900/50 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Name and Avatar */}
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0 pt-1 pr-16">
            <h3 className="font-semibold text-lg text-foreground truncate group-hover:text-primary transition-colors">
              {entity.name}
            </h3>
          </div>
        </div>

        {/* Contact Info */}
        <div className="space-y-2 mb-4">
          {entity.phone && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Phone className="h-4 w-4 flex-shrink-0 text-emerald-500" />
              <span className="truncate">{entity.phone}</span>
            </div>
          )}
          {entity.email && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-4 w-4 flex-shrink-0 text-blue-500" />
              <span className="truncate">{entity.email}</span>
            </div>
          )}
          {entity.address && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4 flex-shrink-0 text-orange-500" />
              <span className="truncate">{entity.address}</span>
            </div>
          )}
          {!entity.phone && !entity.email && !entity.address && (
            <p className="text-sm text-muted-foreground/60 italic">No contact info</p>
          )}
        </div>

        {/* Balance Section */}
        <div className="pt-3 border-t border-border/50">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Balance</span>
            <span className={`text-lg font-bold ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {isPositive ? '+' : '-'}₹{displayBalance.toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
