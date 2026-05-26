import React, { useRef, useState } from 'react';
import { useWizard } from '../../context/wizard-context';
import { parseReqIfFile } from '../../parser/reqif-parser';
import './UploadStep.css';

const ACCEPTED = '.reqif,.reqifz';

const UploadStep: React.FC = () => {
  const { dispatch } = useWizard();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFile = async (file: File) => {
    if (!file) return;

    const ext = file.name.toLowerCase();
    if (!ext.endsWith('.reqif') && !ext.endsWith('.reqifz')) {
      dispatch({
        type: 'SET_ERROR',
        message: `Unsupported file type "${file.name}". Please select a .reqif or .reqifz file.`,
      });
      return;
    }

    setIsParsing(true);
    dispatch({ type: 'CLEAR_ERROR' });

    try {
      const buffer = await readAsArrayBuffer(file);
      const document = await parseReqIfFile(buffer, file.name);
      dispatch({ type: 'SET_PARSED_DOCUMENT', document });
      dispatch({ type: 'SET_STEP', step: 'mapping' });
    } catch (err: unknown) {
      dispatch({
        type: 'SET_ERROR',
        message: err instanceof Error ? err.message : 'An unexpected error occurred while parsing.',
      });
    } finally {
      setIsParsing(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  return (
    <div className="upload-step">
      <h3 className="upload-step__title">Upload ReqIF File</h3>
      <p className="upload-step__description">
        Select or drag a <code>.reqif</code> or <code>.reqifz</code> file to import requirements.
      </p>

      <div
        className={['upload-step__dropzone', isDragOver ? 'upload-step__dropzone--over' : ''].join(' ')}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Drop zone for ReqIF file upload"
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      >
        {isParsing ? (
          <div aria-busy="true" role="progressbar" aria-label="Parsing file…" className="upload-step__spinner">
            Parsing…
          </div>
        ) : (
          <>
            <span className="upload-step__icon" aria-hidden="true">📂</span>
            <span>Click to browse or drag &amp; drop here</span>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="upload-step__input"
        onChange={handleInputChange}
        aria-label="Select a .reqif or .reqifz file"
      />
    </div>
  );
};

export default UploadStep;

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsArrayBuffer(file);
  });
}
