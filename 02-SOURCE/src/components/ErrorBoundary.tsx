import { Component, type ErrorInfo, type ReactNode } from 'react'
interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo)
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#0a0d14',
            color: '#ffffff',
            fontFamily: 'Inter, sans-serif',
            padding: '24px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              maxWidth: '540px',
              backgroundColor: '#121824',
              borderRadius: '16px',
              padding: '32px',
              border: '1px solid #243045',
              boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
            }}
          >
            <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '12px', color: '#f87171' }}>
              Application Notice
            </h2>
            <p style={{ fontSize: '15px', color: '#94a3b8', marginBottom: '20px', lineHeight: 1.5 }}>
              The terminal encountered an unexpected display issue.
            </p>
            {this.state.error?.message && (
              <pre
                style={{
                  fontSize: '12px',
                  backgroundColor: '#070a0f',
                  padding: '12px',
                  borderRadius: '8px',
                  color: '#e2e8f0',
                  textAlign: 'left',
                  overflowX: 'auto',
                  marginBottom: '24px',
                }}
              >
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null })
                window.location.reload()
              }}
              style={{
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                padding: '12px 28px',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Restart Interface
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
