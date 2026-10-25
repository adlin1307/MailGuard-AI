import {
  DashboardData,
  DatasetSummary,
  DatasetStatistics,
  ChiSquareAnalysis,
  TrainingStatus,
  EvaluationData,
  PredictionResult,
  PredictionRecord,
} from '../types';
import { mlEngine } from './ml-engine';
import { generateScanReportPdf, triggerFileDownload } from './pdf-generator';

export { triggerFileDownload };

export const api = {
  // Health
  async getHealth() {
    return {
      status: 'healthy',
      service: 'probmail-security-engine',
      model_loaded: true,
    };
  },

  // Dashboard
  async getDashboard(): Promise<DashboardData> {
    return mlEngine.getDashboardData();
  },

  // Dataset
  async getDatasetSummary(): Promise<{ is_loaded: boolean; summary?: DatasetSummary }> {
    return mlEngine.getDatasetSummary();
  },

  async loadSampleDataset(): Promise<{ status: string; message: string; summary: DatasetSummary }> {
    const res = mlEngine.loadSampleDataset();
    return {
      status: 'success',
      message: 'Sample email dataset successfully loaded into platform.',
      summary: res.summary,
    };
  },

  async uploadDataset(formData: FormData): Promise<{ status: string; message: string; summary: DatasetSummary }> {
    const file = formData.get('file') as File | null;
    if (!file) {
      throw new Error('No dataset file provided.');
    }
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      throw new Error('CSV file is empty or missing data rows.');
    }

    const header = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/['"]/g, ''));
    let labelIdx = header.findIndex((h) => h.includes('label') || h.includes('class') || h.includes('target'));
    let bodyIdx = header.findIndex((h) => h.includes('body') || h.includes('text') || h.includes('content') || h.includes('message'));
    let subjIdx = header.findIndex((h) => h.includes('subject') || h.includes('title'));

    if (labelIdx === -1) labelIdx = 0;
    if (bodyIdx === -1) bodyIdx = header.length > 2 ? 2 : 1;

    const parsedRows: { label: 'ham' | 'spam'; subject: string; body: string }[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      // Simple CSV regex parse
      const matches = line.match(/(?:^|,)(?:"([^"]*(?:""[^"]*)*)"|([^",]*))/g);
      if (!matches) continue;
      const cols = matches.map((m) => {
        let val = m.replace(/^,/, '').trim();
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.slice(1, -1).replace(/""/g, '"');
        }
        return val;
      });

      const rawLabel = (cols[labelIdx] || '').toLowerCase().trim();
      const isSpam = rawLabel === 'spam' || rawLabel === '1' || rawLabel === 'malicious';
      const label = isSpam ? ('spam' as const) : ('ham' as const);
      const subj = subjIdx !== -1 && cols[subjIdx] ? cols[subjIdx] : '';
      const body = cols[bodyIdx] || cols[cols.length - 1] || '';

      if (body.trim().length > 0 || subj.trim().length > 0) {
        parsedRows.push({ label, subject: subj, body });
      }
    }

    if (parsedRows.length === 0) {
      throw new Error('No valid rows could be extracted from uploaded CSV file.');
    }

    const summary = mlEngine.uploadDataset(parsedRows);
    return {
      status: 'success',
      message: `Successfully processed and cleaned ${parsedRows.length} email records.`,
      summary,
    };
  },

  async remapColumns(mappings: {
    text_column: string;
    label_column: string;
    subject_column?: string;
  }): Promise<{ status: string; summary: DatasetSummary }> {
    const res = mlEngine.getDatasetSummary();
    const updatedSummary = {
      ...res.summary,
      selected_columns: {
        text_column: mappings.text_column,
        label_column: mappings.label_column,
        subject_column: mappings.subject_column || null,
      },
    };
    return { status: 'success', summary: updatedSummary };
  },

  // Analytics
  async getStatistics(): Promise<{ is_available: boolean; filename?: string; statistics: DatasetStatistics }> {
    const stats = mlEngine.getStatistics();
    return {
      is_available: true,
      filename: 'sample_dataset.csv',
      statistics: stats,
    };
  },

  async getChiSquare(k: number = 50): Promise<{ is_available: boolean; filename?: string; analysis: ChiSquareAnalysis }> {
    const analysis = mlEngine.getChiSquare(k);
    return {
      is_available: true,
      filename: 'sample_dataset.csv',
      analysis,
    };
  },

  // Model Training
  async startTraining(params: {
    k_best: number;
    test_size: number;
    alpha: number;
    max_features: number;
  }): Promise<{ status: string; message: string }> {
    return mlEngine.startTraining(params);
  },

  async getTrainingStatus(): Promise<TrainingStatus> {
    return mlEngine.getTrainingStatus();
  },

  async getEvaluation(): Promise<EvaluationData> {
    return mlEngine.getEvaluationData();
  },

  // Prediction / Scanner
  async predictEmail(payload: { subject?: string; body?: string }): Promise<PredictionResult> {
    return mlEngine.predictEmail(payload.subject, payload.body);
  },

  async predictEmailFile(formData: FormData): Promise<PredictionResult> {
    const file = formData.get('file') as File | null;
    if (!file) {
      throw new Error('No file provided for email analysis.');
    }
    const text = await file.text();
    // Parse possible .eml header
    let subject = file.name.replace(/\.[^/.]+$/, '');
    let body = text;

    const subjectMatch = text.match(/^Subject:\s*(.+)$/im);
    if (subjectMatch) {
      subject = subjectMatch[1].trim();
      const bodySplit = text.split(/\r?\n\r?\n/);
      if (bodySplit.length > 1) {
        body = bodySplit.slice(1).join('\n\n');
      }
    }

    return mlEngine.predictEmail(subject, body);
  },

  // Prediction History
  async getHistory(): Promise<{ status: string; count: number; statistics: any; predictions: PredictionRecord[] }> {
    const hist = mlEngine.getHistory();
    return {
      status: 'success',
      count: hist.count,
      statistics: hist.statistics,
      predictions: hist.predictions,
    };
  },

  async getPredictionDetail(id: number): Promise<{ status: string; prediction: PredictionRecord }> {
    const pred = mlEngine.getPredictionById(id);
    if (!pred) throw new Error(`Scan audit with ID #${id} not found.`);
    return { status: 'success', prediction: pred };
  },

  async clearHistory(): Promise<{ status: string; message: string; deleted_count: number }> {
    const res = mlEngine.clearHistory();
    return {
      status: 'success',
      message: `Cleared ${res.deleted_count} scan audit records.`,
      deleted_count: res.deleted_count,
    };
  },

  // PDF Reports
  async downloadScanReport(payload: Record<string, any>): Promise<Blob> {
    return generateScanReportPdf(payload);
  },

  async downloadScanReportById(id: number): Promise<Blob> {
    const pred = mlEngine.getPredictionById(id);
    if (!pred) throw new Error(`Scan audit with ID #${id} not found.`);
    return generateScanReportPdf(pred);
  },
};
