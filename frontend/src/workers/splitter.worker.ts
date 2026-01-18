/**
 * Web Worker for audio splitting - offloads heavy network I/O from main thread
 * Keeps UI responsive during stem separation processing
 */

type WorkerMessage = {
  type: 'START_SPLIT';
  audioFile: File;
  sessionId: string;
};

type WorkerResponse = 
  | { type: 'PROGRESS'; progress: number }
  | { type: 'COMPLETION'; result: any }
  | { type: 'ERROR'; message: string };

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  if (event.data.type === 'START_SPLIT') {
    const { audioFile, sessionId } = event.data;
    
    try {
      // Send initial progress
      self.postMessage({ type: 'PROGRESS', progress: 5 } as WorkerResponse);
      
      // Prepare form data for upload
      const formData = new FormData();
      formData.append('file', audioFile);
      formData.append('session_id', sessionId);
      
      self.postMessage({ type: 'PROGRESS', progress: 10 } as WorkerResponse);
      
      // Call backend API
      const response = await fetch('http://localhost:8000/api/split', {
        method: 'POST',
        body: formData,
      });
      
      self.postMessage({ type: 'PROGRESS', progress: 30 } as WorkerResponse);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      self.postMessage({ type: 'PROGRESS', progress: 95 } as WorkerResponse);
      
      const result = await response.json();
      
      self.postMessage({ type: 'PROGRESS', progress: 100 } as WorkerResponse);
      self.postMessage({ type: 'COMPLETION', result } as WorkerResponse);
      
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      self.postMessage({ type: 'ERROR', message } as WorkerResponse);
    }
  }
};

// Export empty object for TypeScript module compatibility
export {};
