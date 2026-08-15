import { LoaderCircle } from 'lucide-react';

type LoadingOverlayProps = {
  message: string;
};

export function LoadingOverlay({ message }: LoadingOverlayProps) {
  return (
    <div className="profile-import-loading" role="status" aria-live="assertive">
      <div className="profile-import-loading-content">
        <LoaderCircle size={24} />
        <strong>{message}</strong>
      </div>
    </div>
  );
}
