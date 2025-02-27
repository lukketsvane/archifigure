# ArchiFigure Project Guide

## Build Commands
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Code Style Guidelines

### Imports
- Use absolute imports with `@/` alias
- Group imports: React, libraries, components, utils/types
- Import specific components rather than entire libraries

### Component Structure
- Use "use client" directive for client components
- Define interfaces for props
- Follow functional component pattern with React.forwardRef when needed
- Use named exports for components

### Styling
- Use Tailwind CSS with `cn()` utility from `@/lib/utils`
- Leverage class-variance-authority (cva) for component variants
- Follow mobile-first responsive design

### TypeScript
- Define explicit types for props and state
- Use interfaces for component props
- Leverage React's built-in types (React.ButtonHTMLAttributes, etc.)

### Error Handling
- Use try/catch blocks for async operations
- Display user-friendly error messages