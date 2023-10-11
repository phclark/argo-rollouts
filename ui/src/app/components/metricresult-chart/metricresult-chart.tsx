import * as React from 'react';
import {Mix} from '@ant-design/plots';

export interface MetricResultTimeSeries {
    name: string;
    data: DataPoint[];
    // metricInfo?: MetricInfo;
}

interface DataPoint {
    timestamp: number;
    value: number;
    status: AnalysisPhase;
}

// export interface MetricInfo {
//     initialDelay?: string;
//     interval?: string;
//     count?: number | string;

//     failureLimit?: number;
//     consecutiveErrorLimit?: number;
//     inconclusiveLimit?: number;

//     successCondition?: string;
//     failureCondition?: string;

//     provider?: string;
// }

export enum AnalysisPhase {
    Pending,
    Running,
    Successful,
    Failed,
    Error,
    Inconclusive,
}

const analysisPhaseStyle = {
    [AnalysisPhase.Pending]: {color: 'gray'},
    [AnalysisPhase.Running]: {color: 'blue'},
    [AnalysisPhase.Successful]: {color: 'green'},
    [AnalysisPhase.Failed]: {color: 'red'},
    [AnalysisPhase.Error]: {color: 'red'},
    [AnalysisPhase.Inconclusive]: {color: 'orange'},
};

export const MetricResultChart = (props: {title: string; series: MetricResultTimeSeries[]}) => {
    const plots = props.series.map((series, index) => {
        const start = {x: 0, y: index / props.series.length};
        const end = {x: 1, y: (index + 1) / props.series.length};
        const showXAxis = index === props.series.length - 1 ? true : false;
        const statusLookup = new Map(series.data.map((d) => [d.timestamp, d.status]));

        const AnnotationContent = () => (
          <div>
            <div>test</div>
          </div>
        );

        console.log('AnnotationContent', AnnotationContent);

        return {
            type: 'line',
            region: {start, end},
            options: {
                data: series.data,
                xField: 'timestamp',
                yField: 'value',
                meta: {
                    timestamp: {
                        type: 'time',
                        mask: 'MM/DD HH:mm:ss',
                    },
                    value: {
                        alias: series.name,
                    },
                },
                legend: false,
                xAxis: showXAxis ? {} : {label: {formatter: (v: any) => ''}},
                yAxis: {
                    label: {
                        formatter: (v: any) => v,
                    },
                    title: {
                        text: series.name,
                    },
                },
                point: {
                    size: 3,
                    style: {
                        lineWidth: 1,
                        fillOpacity: 1,
                    },
                    color: (item: DataPoint) => {
                      return analysisPhaseStyle[statusLookup.get(item.timestamp) as AnalysisPhase]?.color || analysisPhaseStyle[AnalysisPhase.Pending].color;
                    },
                },
            },
        };
    });

    const config = {
        plots: plots,
        tooltip: {
            shared: true,
        },
        legend: {
            layout: 'vertical',
            position: 'right',
            title: {
                text: 'Measurement Status',
            },
            custom: true,
            items: Object.entries(analysisPhaseStyle).map(([phase, style]) => {
                return {
                    id: phase,
                    name: AnalysisPhase[Number(phase)],
                    value: Number(phase),
                    marker: {
                        style: {
                            fill: style.color,
                            r: 5,
                        },
                    },
                };
            }),
        },
    };
    console.log(config);
    return (
    <React.Fragment>
      <Mix {...config} />
    </React.Fragment>)
};
