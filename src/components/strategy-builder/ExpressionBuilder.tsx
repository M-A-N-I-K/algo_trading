"use client";

import {
  Expression,
  ExpressionKind,
  IndicatorId,
  PriceField,
  ReferenceId,
  getIndicatorDefinition,
  getReferenceDefinition,
  listExpressionKinds,
  listIndicators,
  listReferences,
} from "@/domain/strategies";
import { PRICE_FIELD_LABELS } from "@/domain/strategies/expressionRegistry";

interface ExpressionBuilderProps {
  value: Expression;
  onChange: (expr: Expression) => void;
  // Hides the "Indicator"/"Reference" source picker recursion one level
  // deep, so an indicator's `source` field doesn't itself offer another
  // nested indicator-of-an-indicator-of-an-indicator picker sprawling
  // infinitely in the UI (still fully supported by the data model).
  allowIndicatorSource?: boolean;
}

const selectClass =
  "bg-slate-900 border border-slate-800 text-slate-200 px-3 py-2 rounded-lg outline-none text-sm transition-all focus:border-violet-500";
const inputClass = selectClass + " w-24";

export default function ExpressionBuilder({ value, onChange, allowIndicatorSource = true }: ExpressionBuilderProps) {
  const kinds = listExpressionKinds();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={value.type}
        onChange={(e) => onChange(defaultExpressionForKind(e.target.value as ExpressionKind))}
        className={selectClass}
      >
        {kinds.map((k) => (
          <option key={k.kind} value={k.kind}>
            {k.label}
          </option>
        ))}
      </select>

      {value.type === "price" && (
        <select value={value.field} onChange={(e) => onChange({ type: "price", field: e.target.value as PriceField })} className={selectClass}>
          {Object.entries(PRICE_FIELD_LABELS).map(([field, label]) => (
            <option key={field} value={field}>
              {label}
            </option>
          ))}
        </select>
      )}

      {value.type === "constant" && (
        <input
          type="number"
          value={value.value}
          onChange={(e) => onChange({ type: "constant", value: Number(e.target.value) })}
          className={inputClass}
        />
      )}

      {value.type === "indicator" && (
        <IndicatorExpressionFields value={value} onChange={onChange} allowSource={allowIndicatorSource} />
      )}

      {value.type === "reference" && <ReferenceExpressionFields value={value} onChange={onChange} />}
    </div>
  );
}

function IndicatorExpressionFields({
  value,
  onChange,
  allowSource,
}: {
  value: Extract<Expression, { type: "indicator" }>;
  onChange: (expr: Expression) => void;
  allowSource: boolean;
}) {
  const def = getIndicatorDefinition(value.indicator);

  return (
    <>
      <select
        value={value.indicator}
        onChange={(e) => {
          const indicator = e.target.value as IndicatorId;
          const newDef = getIndicatorDefinition(indicator);
          onChange({
            type: "indicator",
            indicator,
            parameters: Object.fromEntries(newDef.parameters.map((p) => [p.name, p.default])),
            output: newDef.outputs[0]?.id,
          });
        }}
        className={selectClass}
      >
        {listIndicators().map((i) => (
          <option key={i.id} value={i.id}>
            {i.label}
          </option>
        ))}
      </select>

      {def.parameters.map((paramDef) => (
        <input
          key={paramDef.name}
          type="number"
          title={paramDef.label}
          min={paramDef.min}
          max={paramDef.max}
          value={value.parameters[paramDef.name] ?? paramDef.default}
          onChange={(e) => onChange({ ...value, parameters: { ...value.parameters, [paramDef.name]: Number(e.target.value) } })}
          className={inputClass + " w-16"}
        />
      ))}

      {def.outputs.length > 1 && (
        <select value={value.output ?? def.outputs[0].id} onChange={(e) => onChange({ ...value, output: e.target.value })} className={selectClass}>
          {def.outputs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      )}

      {def.requiresSource && allowSource && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500">of</span>
          <ExpressionBuilder
            value={value.source ?? { type: "price", field: "CLOSE" }}
            onChange={(source) => onChange({ ...value, source })}
            allowIndicatorSource={false}
          />
        </div>
      )}
    </>
  );
}

function ReferenceExpressionFields({
  value,
  onChange,
}: {
  value: Extract<Expression, { type: "reference" }>;
  onChange: (expr: Expression) => void;
}) {
  const def = getReferenceDefinition(value.reference);

  return (
    <>
      <select
        value={value.reference}
        onChange={(e) => {
          const reference = e.target.value as ReferenceId;
          const newDef = getReferenceDefinition(reference);
          onChange({ type: "reference", reference, parameters: Object.fromEntries(newDef.parameters.map((p) => [p.name, p.default])) });
        }}
        className={selectClass}
      >
        {listReferences().map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </select>
      {def.parameters.map((paramDef) => (
        <input
          key={paramDef.name}
          type="number"
          title={paramDef.label}
          min={paramDef.min}
          value={value.parameters[paramDef.name] ?? paramDef.default}
          onChange={(e) => onChange({ ...value, parameters: { ...value.parameters, [paramDef.name]: Number(e.target.value) } })}
          className={inputClass + " w-16"}
        />
      ))}
    </>
  );
}

export function defaultExpressionForKind(kind: ExpressionKind): Expression {
  switch (kind) {
    case "price":
      return { type: "price", field: "CLOSE" };
    case "volume":
      return { type: "volume" };
    case "constant":
      return { type: "constant", value: 0 };
    case "time":
      return { type: "time" };
    case "dayOfWeek":
      return { type: "dayOfWeek" };
    case "indicator":
      return { type: "indicator", indicator: "EMA", parameters: { period: 20 } };
    case "reference":
      return { type: "reference", reference: "OPENING_RANGE_HIGH", parameters: { minutes: 15 } };
  }
}
