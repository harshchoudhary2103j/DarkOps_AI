import React from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary';
  isLoading?: boolean;
  id?: string;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'primary',
  isLoading = false,
  id,
}) => {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2.5 text-white">
          {variant === 'danger' && <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />}
          <span>{title}</span>
        </div>
      }
      id={id}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose} disabled={isLoading} id={`${id}-cancel`}>
            {cancelText}
          </Button>
          <Button
            variant={variant === 'danger' ? 'danger' : 'primary'}
            size="sm"
            onClick={onConfirm}
            isLoading={isLoading}
            id={`${id}-confirm`}
          >
            {confirmText}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-300 leading-relaxed">{message}</p>
    </Dialog>
  );
};
