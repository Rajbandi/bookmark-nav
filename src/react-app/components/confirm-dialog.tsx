import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";

// Pending confirmation; null means the dialog is closed.
export interface ConfirmState {
	title: string;
	description?: string;
	confirmText?: string;
	onConfirm: () => void;
}

// Consistent confirmation dialog for destructive actions, replacing native confirm().
export function ConfirmDialog({
	state,
	onClose,
}: {
	state: ConfirmState | null;
	onClose: () => void;
}) {
	return (
		<AlertDialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{state?.title}</AlertDialogTitle>
					{state?.description && (
						<AlertDialogDescription>{state.description}</AlertDialogDescription>
					)}
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						className={buttonVariants({ variant: "destructive" })}
						onClick={() => {
							state?.onConfirm();
							onClose();
						}}
					>
						{state?.confirmText ?? "Delete"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
