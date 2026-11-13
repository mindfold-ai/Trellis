#!/usr/bin/env python3
"""Summarize raw public-entry samples without discarding ranges or warmups."""
from __future__ import annotations
import argparse
import collections
import json
import statistics
from pathlib import Path


def summarize(report):
    groups=collections.defaultdict(list)
    gates=collections.defaultdict(int)
    for sample in report['samples']:
        if not sample['warmup']:
            operation=sample.get('operation','task_create')
            if operation=='record_gate':
                key=(sample['scenario'],sample['repetition']);index=gates[key];gates[key]+=1
                operation+='_'+('check','full_review','readiness')[index]
            groups[(sample['scenario'],operation)].append(sample)
    rows=[]
    for (scenario,operation),samples in sorted(groups.items()):
        row={'scenario':scenario,'operation':operation,'n':len(samples)}
        for metric in ('complete_elapsed_seconds','elapsed_seconds','python_peak_rss_bytes','git_peak_rss_bytes',
                       'requested_object_reads','unique_git_blob_contents_read','git_blob_read_bytes','git_max_object_bytes',
                       'sha256_calls','sha256_input_bytes','git_seconds','observation_seconds'):
            values=[s[metric] for s in samples]
            row[metric]={'median':statistics.median(values),'min':min(values),'max':max(values)}
        row['git_commands']=samples[0]['git_commands']
        row['git_commands_stable']=all(s['git_commands']==samples[0]['git_commands'] for s in samples)
        row['components_seconds_median']={k:statistics.median(s['components_seconds'].get(k,0) for s in samples) for k in set().union(*(s['components_seconds'] for s in samples))}
        rows.append(row)
    totals=[]
    by_rep=collections.defaultdict(list)
    for sample in report['samples']:
        if not sample['warmup'] and sample['scenario'].startswith('delivery-'):
            by_rep[(sample['scenario'],sample['repetition'])].append(sample)
    for scenario in sorted({key[0] for key in by_rep}):
        values=[sum(s['complete_elapsed_seconds'] for s in samples) for (name,_),samples in by_rep.items() if name==scenario]
        totals.append({'scenario':scenario,'seven_measured_cli_operations_seconds':{'median':statistics.median(values),'min':min(values),'max':max(values)},
                       'definition':'candidate + begin_check + check + full_review + readiness + record_delivery + exact retry; scope/planning preparation excluded'})
    return {'rows':rows,'lifecycle_subtotals':totals}


def main():
    parser=argparse.ArgumentParser();parser.add_argument('report',type=Path);parser.add_argument('--output',type=Path);args=parser.parse_args()
    result=summarize(json.loads(args.report.read_text()))
    text=json.dumps(result,indent=2)+'\n'
    if args.output: args.output.write_text(text)
    else: print(text)

if __name__=='__main__':main()
