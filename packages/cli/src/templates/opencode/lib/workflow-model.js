import { existsSync, readFileSync } from "fs"
import { join } from "path"

function stripInlineComment(value) {
  let quote = null
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]
    if (quote) {
      if (ch === quote) quote = null
      continue
    }
    if (ch === "\"" || ch === "'") {
      quote = ch
      continue
    }
    if (ch === "#" && (i === 0 || /\s/.test(value[i - 1] || ""))) {
      return value.slice(0, i)
    }
  }
  return value
}

function parseScalar(value) {
  const trimmed = stripInlineComment(value).trim()
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function indentOf(line) {
  return line.length - line.trimStart().length
}

function readProjectText(projectRoot, relativePath) {
  if (!relativePath || typeof relativePath !== "string") return ""
  const fullPath = join(projectRoot, relativePath)
  try {
    return existsSync(fullPath) ? readFileSync(fullPath, "utf-8").trim() : ""
  } catch {
    return ""
  }
}

export function loadWorkflowManifest(projectRoot) {
  const manifestPath = join(projectRoot, ".trellis", "workflow.yaml")
  if (!existsSync(manifestPath)) {
    return null
  }

  let content
  try {
    content = readFileSync(manifestPath, "utf-8")
  } catch {
    return null
  }

  const manifest = {
    phaseIndex: { diagram: [], extraBodyFile: "" },
    workflowStates: {},
    phases: [],
  }
  let section = ""
  let currentPhase = null
  let currentStep = null

  for (const rawLine of content.split(/\r?\n/)) {
    const trimmed = rawLine.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const indent = indentOf(rawLine)

    if (indent === 0) {
      section = trimmed.endsWith(":") ? trimmed.slice(0, -1) : ""
      currentPhase = null
      currentStep = null
      continue
    }

    if (section === "phase_index") {
      if (indent === 2 && trimmed.startsWith("extra_body_file:")) {
        manifest.phaseIndex.extraBodyFile = parseScalar(trimmed.slice("extra_body_file:".length))
      } else if (indent === 4 && trimmed.startsWith("- ")) {
        const item = parseScalar(trimmed.slice(2))
        if (item) manifest.phaseIndex.diagram.push(item)
      }
      continue
    }

    if (section === "workflow_states") {
      const stateMatch = indent === 2 ? trimmed.match(/^([A-Za-z0-9_-]+):\s*$/) : null
      if (stateMatch) {
        currentStep = stateMatch[1]
        manifest.workflowStates[currentStep] = { bodyFile: "" }
        continue
      }
      if (currentStep && indent === 4 && trimmed.startsWith("body_file:")) {
        manifest.workflowStates[currentStep].bodyFile = parseScalar(trimmed.slice("body_file:".length))
      }
      continue
    }

    if (section === "phases") {
      const phaseMatch = indent === 2 ? trimmed.match(/^([^:]+):\s*$/) : null
      if (phaseMatch) {
        currentPhase = { id: phaseMatch[1], title: "", label: "", summary: "", steps: [] }
        manifest.phases.push(currentPhase)
        currentStep = null
        continue
      }
      if (!currentPhase) continue

      const stepMatch = indent === 6 ? trimmed.match(/^([^:]+):\s*$/) : null
      if (stepMatch) {
        currentStep = {
          id: stepMatch[1],
          title: "",
          requirement: "",
          cardinality: "",
          summary: "",
          bodyFile: "",
        }
        currentPhase.steps.push(currentStep)
        continue
      }

      const pair = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/)
      if (!pair) continue
      const key = pair[1]
      const value = parseScalar(pair[2] || "")
      if (indent === 4 && key !== "steps") {
        currentPhase[key] = value
      } else if (indent === 8 && currentStep) {
        if (key === "body_file") {
          currentStep.bodyFile = value
        } else {
          currentStep[key] = value
        }
      }
    }
  }

  return manifest
}

function badge(step) {
  const requirement = (step.requirement || "").replace(/_/g, " ")
  const cardinality = (step.cardinality || "").replace(/_/g, " ")
  if (requirement && cardinality) return `[${requirement} · ${cardinality}]`
  if (requirement) return `[${requirement}]`
  return ""
}

function renderStep(projectRoot, step) {
  return readProjectText(projectRoot, step.bodyFile)
}

export function loadWorkflowStateBodies(projectRoot) {
  const manifest = loadWorkflowManifest(projectRoot)
  if (!manifest) return {}
  const result = {}
  for (const [status, state] of Object.entries(manifest.workflowStates)) {
    const body = readProjectText(projectRoot, state.bodyFile)
    if (body) result[status] = body
  }
  return result
}

export function renderWorkflowToc(projectRoot) {
  const manifest = loadWorkflowManifest(projectRoot)
  if (!manifest) return "No workflow.yaml found"

  const lines = [
    "# Development Workflow: Section Index",
    "Full guide: .trellis/workflow.yaml (structured source; body files in .trellis/workflow/)",
    "",
    "## Contents",
    "- .trellis/workflow.yaml",
    "- .trellis/workflow/",
  ]
  for (const phase of manifest.phases) {
    const label = phase.label || `Phase ${phase.id}`
    lines.push(`- ${label}: ${phase.title}`.trimEnd())
  }
  lines.push("", "---", "", "## Phase Index", "")

  if (manifest.phaseIndex.diagram.length > 0) {
    lines.push("```", ...manifest.phaseIndex.diagram, "```", "")
  }

  for (const phase of manifest.phases) {
    const label = phase.label || `Phase ${phase.id}`
    lines.push(`### ${label}: ${phase.title}`.trimEnd())
    for (const step of phase.steps) {
      const suffix = step.summary ? ` (${step.summary})` : ""
      lines.push(`- ${step.id} ${step.title} \`${badge(step)}\`${suffix}`.trimEnd())
    }
    lines.push("")
  }

  const extraBody = readProjectText(projectRoot, manifest.phaseIndex.extraBodyFile)
  if (extraBody) lines.push(extraBody, "")
  lines.push("---", "")

  for (const phase of manifest.phases) {
    const label = phase.label || `Phase ${phase.id}`
    lines.push(`## ${label}: ${phase.title}`.trimEnd(), "")
    if (phase.summary) lines.push(`Goal: ${phase.summary}`, "")
    for (const step of phase.steps) {
      const body = renderStep(projectRoot, step)
      if (body) lines.push(body, "")
    }
  }

  return lines.join("\n").trimEnd()
}
