#!/usr/bin/env python3
"""Evaluate immutable numeric pre-implementation ceilings against after samples."""
from __future__ import annotations
import argparse
import datetime
import json
import statistics
from pathlib import Path


def grouped(report):
    result={}
    gates={}
    for sample in report['samples']:
        if sample['warmup']:continue
        operation=sample.get('operation','task_create')
        if operation=='record_gate':
            gate_key=(sample['scenario'],sample['repetition'])
            index=gates.get(gate_key,0);gates[gate_key]=index+1
            operation+='_'+('check','full_review','readiness')[index]
        key=sample['scenario']+'::'+operation
        result.setdefault(key,[]).append(sample)
    return result


def freeze(before,contract):
    limits={}
    for key,samples in grouped(before).items():
        median=statistics.median(s['complete_elapsed_seconds'] for s in samples)
        if key.endswith('::task_create'): ratio=contract['primary_time_ratio_limits']['task_create'];ceiling=median*ratio
        elif key.endswith('::record_delivery'):
            ratio=contract['primary_time_ratio_limits']['record_delivery_10001' if '-p10001' in key else 'record_delivery_128'];ceiling=median*ratio
        else: ratio=None;ceiling=max(median*1.5,median+0.25)
        limits[key]={'before_median_seconds':median,'after_max_median_seconds':ceiling,'primary_ratio':ratio}
    return {'frozen_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'baseline_source':before['source'],'harness_sha256':contract['harness_sha256'],
            'resource_ceilings_bytes':contract['resource_ceilings_bytes'],'limits':limits}


def evaluate(after,limits):
    groups=grouped(after); rows=[]
    for key,limit in limits['limits'].items():
        samples=groups.get(key,[])
        if len(samples)!=2:rows.append({'case':key,'passed':False,'reason':'expected exactly two timed samples'});continue
        median=statistics.median(s['complete_elapsed_seconds'] for s in samples)
        py=max(s['python_peak_rss_bytes'] for s in samples);git=max(s['git_peak_rss_bytes'] for s in samples)
        commands=True
        if key.endswith('::task_create'):
            commands=all(s['git_commands'].get('show',0)==0 and 1<=s['git_commands'].get('cat-file',0)<=((s['unique_blobs']+127)//128)+1 and s['git_commands'].get('ls-tree',0)<=s['heads'] and s['requested_object_reads']<=s['unique_blobs'] for s in samples)
        if key.endswith('::record_delivery'):
            commands=all(s['git_commands'].get('show',0)==0 and 1<=s['git_commands'].get('cat-file',0)<=((s['unique_blobs']+127)//128)+1 and s['git_commands'].get('ls-tree',0)<=1
                         and s['requested_object_reads']<=s['unique_blobs'] for s in samples)
        passed=median<=limit['after_max_median_seconds'] and py<=limits['resource_ceilings_bytes']['python_individual_max'] and git<=limits['resource_ceilings_bytes']['git_individual_max'] and commands
        rows.append({'case':key,'passed':passed,'before_median_seconds':limit['before_median_seconds'],
                     'after_median_seconds':median,'max_median_seconds':limit['after_max_median_seconds'],
                     'speedup':limit['before_median_seconds']/median,'python_peak_bytes':py,'git_peak_bytes':git,'object_and_process_limits_passed':commands})
    return {'passed':all(row['passed'] for row in rows),'rows':rows}


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--before',type=Path);parser.add_argument('--contract',type=Path);parser.add_argument('--after',type=Path);parser.add_argument('--limits',type=Path,required=True);parser.add_argument('--output',type=Path);args=parser.parse_args()
    if args.before:
        if args.limits.exists():raise SystemExit('Refusing to overwrite frozen numeric limits')
        result=freeze(json.loads(args.before.read_text()),json.loads(args.contract.read_text()));args.limits.write_text(json.dumps(result,indent=2)+'\n')
    else:
        result=evaluate(json.loads(args.after.read_text()),json.loads(args.limits.read_text()))
        text=json.dumps(result,indent=2)+'\n'
        if args.output:args.output.write_text(text)
        else:print(text)
        if not result['passed']:raise SystemExit(1)

if __name__=='__main__':main()
