import React, { useState, useEffect } from 'react';
import {
  Layers,
  Play,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Cpu,
  ShieldCheck,
  ArrowRight,
  Database,
  Sliders,
  Award,
} from 'lucide-react';
import { api } from '../services/api';
import { TrainingStatus, EvaluationData } from '../types';
import { PageId } from '../components/Sidebar';

interface TrainingPageProps {
  onNavigate: (page: PageId) => void;
  onModelTrained: () => void;
}

export const TrainingPage: React.FC<TrainingPageProps> = ({ onNavigate, onModelTrained }) => {
  // Hyperparameters
  const [kBest, setKBest] = useState<number>(50);
  const [testSize, setTestSize] = useState<number>(0.2);
  const [alpha, setAlpha] = useState<number>(1.0);
  const [maxFeatures, setMaxFeatures] = useState<number>(1500);

  // Job status
  const [status, setStatus] = useState<TrainingStatus | null>(null);
  const [activeModel, setActiveModel] = useState<EvaluationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Poll job status if running
  useEffect(() => {
    let interval: any = null;

    const checkStatus = async () => {
      try {
        const s = await api.getTrainingStatus();
        setStatus(s);
        if (s.status === 'completed') {
          onModelTrained();
          fetchActiveModel();
        }
      } catch (err) {
        // silent
      }
    };

    checkStatus();
    fetchActiveModel();

    if (status?.status === 'running') {
      interval = setInterval(checkStatus, 700);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [status?.status]);

  const fetchActiveModel = async () => {
    try {
      const evalData = await api.getEvaluation();
      setActiveModel(evalData);
    } catch {
      // silent
    }
  };

  const handleStartTraining = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await api.startTraining({
        k_best: kBest,
        test_size: testSize,
        alpha: alpha,
        max_features: maxFeatures,
      });

      // Fetch status immediately to trigger polling
      const s = await api.getTrainingStatus();
      setStatus(s);
    } catch (err: any) {
      setError(err.message || 'Failed to start model training.');
    } finally {
      setLoading(false);
    }
  };

  const isRunning = status?.status === 'running';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Pipeline Assembly & Training</h1>
          <p className="text-sm text-slate-400 mt-1">
            Construct and fit a leakage-free Scikit-Learn Pipeline combining TF-IDF, Chi-Square selection, and Multinomial Naive Bayes.
          </p>
        </div>

        <button
          onClick={fetchActiveModel}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 self-start sm:self-auto transition"
          title="Refresh model state"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Progress & Live Job Status Tracker */}
      {status && status.status !== 'idle' && (
        <div
          className={`p-5 rounded-xl border transition-all ${
            status.status === 'running'
              ? 'bg-cyan-950/20 border-cyan-800/80 shadow-md shadow-cyan-950/50'
              : status.status === 'completed'
              ? 'bg-emerald-950/20 border-emerald-800/80'
              : 'bg-rose-950/20 border-rose-800/80'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              {status.status === 'running' && (
                <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
              )}
              {status.status === 'completed' && (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              )}
              {status.status === 'failed' && (
                <AlertCircle className="w-4 h-4 text-rose-400" />
              )}
              <span className="text-xs font-semibold uppercase tracking-wider font-mono text-white">
                Training Status: {status.status.toUpperCase()}
              </span>
            </div>
            <span className="text-xs font-mono font-bold text-cyan-400">
              {status.progress}%
            </span>
          </div>

          {/* Progress Bar */}
          <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden mb-3">
            <div
              className={`h-full transition-all duration-300 ${
                status.status === 'failed' ? 'bg-rose-500' : 'bg-cyan-500'
              }`}
              style={{ width: `${status.progress}%` }}
            />
          </div>

          <div className="flex justify-between items-center text-xs text-slate-300 font-mono">
            <span>{status.step_message}</span>
            {status.completed_at && (
              <span className="text-slate-500">
                Completed: {new Date(status.completed_at).toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Grid: Training Form + Active Model Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Training Parameters Form */}
        <div className="lg:col-span-7 space-y-4">
          <form
            onSubmit={handleStartTraining}
            className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-5"
          >
            <div>
              <h3 className="text-sm font-semibold text-white tracking-tight flex items-center space-x-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                <span>Hyperparameter Configuration</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Configure feature extraction and Bayesian smoothing parameters before training.
              </p>
            </div>

            {/* Chi-Square k Features */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <label className="font-medium text-slate-300">
                  Chi-Square Selected Features (k)
                </label>
                <span className="font-mono text-cyan-400 font-bold">{kBest} features</span>
              </div>
              <input
                type="range"
                min={10}
                max={200}
                step={5}
                value={kBest}
                onChange={(e) => setKBest(Number(e.target.value))}
                disabled={isRunning}
                className="w-full accent-cyan-500 bg-slate-800"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>10 (Sparse / High Precision)</span>
                <span>50 (Recommended)</span>
                <span>200 (Broad Lexicon)</span>
              </div>
            </div>

            {/* Train/Test Split Ratio */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <label className="font-medium text-slate-300">
                  Stratified Split Ratio
                </label>
                <span className="font-mono text-cyan-400 font-bold">
                  {Math.round((1 - testSize) * 100)}% Train / {Math.round(testSize * 100)}% Test
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[0.2, 0.25, 0.3].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setTestSize(val)}
                    disabled={isRunning}
                    className={`py-1.5 px-3 rounded-lg border text-xs font-mono transition ${
                      testSize === val
                        ? 'bg-cyan-950 border-cyan-700 text-cyan-300 font-bold'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {Math.round((1 - val) * 100)} / {Math.round(val * 100)}
                  </button>
                ))}
              </div>
            </div>

            {/* MultinomialNB Smoothing Alpha */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <label className="font-medium text-slate-300">
                  MultinomialNB Laplace Smoothing (α)
                </label>
                <span className="font-mono text-cyan-400 font-bold">α = {alpha.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min={0.1}
                max={2.0}
                step={0.1}
                value={alpha}
                onChange={(e) => setAlpha(Number(e.target.value))}
                disabled={isRunning}
                className="w-full accent-cyan-500 bg-slate-800"
              />
              <p className="text-[11px] text-slate-500">
                Prevents zero-frequency probabilities for unseen words during real-time inference.
              </p>
            </div>

            {/* Submit Button */}
            <div className="pt-3 border-t border-slate-800">
              <button
                type="submit"
                disabled={isRunning || loading}
                className="w-full py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold flex items-center justify-center space-x-2 shadow-sm shadow-cyan-900/50 transition disabled:opacity-50"
              >
                {isRunning ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Training in Progress...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    <span>Train Pipeline on Active Dataset</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Right Panel: Active Model Metadata */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-semibold text-white tracking-tight">Active Fitted Pipeline</h3>
              <span className={`text-[11px] px-2 py-0.5 rounded font-mono font-medium border ${
                activeModel?.is_trained
                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                  : 'bg-amber-950/80 text-amber-300 border-amber-800'
              }`}>
                {activeModel?.is_trained ? 'Operational' : 'Untrained'}
              </span>
            </div>

            {activeModel?.is_trained ? (
              <div className="space-y-4">
                <div className="space-y-2 text-xs font-mono">
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Model Name:</span>
                    <span className="text-slate-200 font-sans text-right truncate max-w-[180px]">
                      {activeModel.model_name}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Trained Timestamp:</span>
                    <span className="text-slate-300">
                      {activeModel.trained_at ? new Date(activeModel.trained_at).toLocaleString() : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Total Dataset:</span>
                    <span className="text-white font-bold">
                      {activeModel.dataset_statistics?.total_samples} samples
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Train / Test Split:</span>
                    <span className="text-cyan-400">
                      {activeModel.dataset_statistics?.train_samples} train / {activeModel.dataset_statistics?.test_samples} test
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Chi-Square k:</span>
                    <span className="text-white">
                      {activeModel.hyperparameters?.k_best_features} features
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Held-out Accuracy:</span>
                    <span className="text-emerald-400 font-bold">
                      {activeModel.evaluation?.overall?.accuracy ? `${(activeModel.evaluation.overall.accuracy * 100).toFixed(1)}%` : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Held-out Macro F1:</span>
                    <span className="text-emerald-400 font-bold">
                      {activeModel.evaluation?.overall?.macro_f1 ? `${(activeModel.evaluation.overall.macro_f1 * 100).toFixed(1)}%` : 'N/A'}
                    </span>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => onNavigate('evaluation')}
                    className="w-full py-2 rounded-lg bg-cyan-950 hover:bg-cyan-900 border border-cyan-800 text-cyan-300 text-xs font-semibold flex items-center justify-center space-x-1.5 transition"
                  >
                    <span>View Full Evaluation Matrix</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-slate-500 space-y-2">
                <Layers className="w-8 h-8 mx-auto text-slate-600" />
                <p className="text-xs">No model has been trained yet.</p>
                <p className="text-[11px] text-slate-600">
                  Click 'Train Pipeline' on the left to initiate model training.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
