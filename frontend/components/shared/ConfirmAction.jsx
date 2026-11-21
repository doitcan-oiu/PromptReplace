import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";

export function ConfirmAction({ confirmation, onClose, onConfirm }) {
  return <AlertDialog open={confirmation.open} onOpenChange={open => !open && onClose()}>
    <AlertDialogContent className="w-[calc(100%_-_2rem)] max-w-md rounded-lg">
      <AlertDialogHeader><AlertDialogTitle>{confirmation.title}</AlertDialogTitle><AlertDialogDescription className="leading-7">{confirmation.description}</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter className="mt-2"><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction className={buttonVariants({ variant: confirmation.danger ? "destructive" : "default" })} onClick={onConfirm}>{confirmation.confirmLabel}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
