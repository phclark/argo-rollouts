import * as React from 'react';

import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faChevronCircleDown, faChevronCircleUp, faUndoAlt} from '@fortawesome/free-solid-svg-icons';
import {Button, Tooltip} from 'antd';
import { Card, Space, Descriptions } from 'antd';
import {IconForTag} from '../../shared/utils/utils';
import {RolloutAnalysisRunInfo, RolloutExperimentInfo, RolloutReplicaSetInfo} from '../../../models/rollout/generated';
import {ReplicaSets} from '../pods/pods';
import {ImageInfo, parseImages} from './rollout';
import {ConfirmButton} from '../confirm-button/confirm-button';
import {InfoItemProps, InfoItemRow} from '../info-item/info-item';
import {MetricResultChart, MetricResultTimeSeries, AnalysisPhase } from '../metricresult-chart/metricresult-chart';

import './rollout.scss';
import '../pods/pods.scss';

import moment = require('moment');

function formatTimestamp(ts: string): string {
    const inputFormat = 'YYYY-MM-DD HH:mm:ss Z z';
    const m = moment(ts, inputFormat);
    if (!ts || !m.isValid()) {
        return 'Never';
    }
    return m.format('MMM D YYYY [at] hh:mm:ss');
}

export interface Revision {
    number: string;
    replicaSets: RolloutReplicaSetInfo[];
    experiments: RolloutExperimentInfo[];
    analysisRuns: RolloutAnalysisRunInfo[];
}

const ImageItems = (props: {images: ImageInfo[]}) => {
    return (
        <div>
            {props.images.map((img) => {
                let imageItems = img?.tags?.map((t) => {
                    return {content: t, icon: IconForTag(t)} as InfoItemProps;
                });
                if (imageItems.length === 0) {
                    imageItems = [];
                }
                return <InfoItemRow key={img.image} label={<div className={`image image--${img.color || 'unknown'}`}>{img.image}</div>} items={imageItems} />;
            })}
        </div>
    );
};

interface RevisionWidgetProps {
    revision: Revision;
    initCollapsed?: boolean;
    rollback?: (revision: number) => void;
    current: boolean;
    message: String;
}

export const RevisionWidget = (props: RevisionWidgetProps) => {
    const {revision, initCollapsed} = props;
    const [collapsed, setCollapsed] = React.useState(initCollapsed);
    const icon = collapsed ? faChevronCircleDown : faChevronCircleUp;
    const images = parseImages(revision.replicaSets);
    const hasPods = (revision.replicaSets || []).some((rs) => rs.pods?.length > 0);
    return (
        <div key={revision.number} className='revision'>
            <div className='revision__header'>
                Revision {revision.number}
                <div style={{marginLeft: 'auto', display: 'flex', alignItems: 'center'}}>
                    {!props.current && props.rollback && (
                        <ConfirmButton
                            onClick={() => props.rollback(Number(revision.number))}
                            type='default'
                            icon={<FontAwesomeIcon icon={faUndoAlt} style={{marginRight: '5px'}} />}
                            style={{fontSize: '13px', marginRight: '10px'}}
                        >
                            Rollback
                        </ConfirmButton>
                    )}
                    {hasPods && <FontAwesomeIcon icon={icon} className='revision__header__button' onClick={() => setCollapsed(!collapsed)} />}
                </div>
            </div>
            <div className='revision__images'>
                <ImageItems images={images} />
            </div>

            {!collapsed && (
                <React.Fragment>
                    <ReplicaSets replicaSets={revision.replicaSets} />
                    {(revision.analysisRuns || []).length > 0 && (
                        <React.Fragment>
                            <div style={{marginTop: '1em'}}>
                                <AnalysisRunWidget analysisRuns={revision.analysisRuns} />
                            </div>
                        </React.Fragment>
                    )}
                </React.Fragment>
            )}
        </div>
    );
};

const AnalysisRunWidget = (props: {analysisRuns: RolloutAnalysisRunInfo[]}) => {
    const {analysisRuns} = props;
    const [selection, setSelection] = React.useState<RolloutAnalysisRunInfo | null>(null);
    const chartData: MetricResultTimeSeries[] = [];

    if (selection?.nonJobInfo) {
        for (const result of selection.nonJobInfo) {
            let series = chartData.find((series) => series.name === result.metricName);
            
            let dataPoint = {
                timestamp: new Date(result.startedAt as string).getTime(),
                value: Number(result.value),
                status: AnalysisPhase[result.status as keyof typeof AnalysisPhase],
            };
            if (!series) {
                series = {
                    name: result.metricName as string,
                    data: [dataPoint],
                };
                chartData.push(series);
            } else {
                series.data.push(dataPoint);
            }
        }
    }

    return (
        <div className='analysis'>
            <div className='analysis-header'>Analysis Runs</div>
            <div className='analysis__runs'>
                {analysisRuns.map((ar) => {
                    let temp = ar.objectMeta?.name?.split('-');
                    let len = temp?.length;
                    return (
                        <Tooltip
                            key={ar.objectMeta?.name}
                            title={
                                <React.Fragment>
                                    <div>
                                        <b>Name:</b> {ar.objectMeta?.name}
                                    </div>
                                    <div>
                                        <b>Created at: </b>
                                        {formatTimestamp(JSON.stringify(ar.objectMeta?.creationTimestamp))}
                                    </div>
                                    <div>
                                        <b>Status: </b>
                                        {ar.status}
                                    </div>
                                </React.Fragment>
                            }
                        >
                            <div
                                className={`analysis__runs-action ${
                                    ar.status === 'Running' ? 'analysis--pending' : ar.status === 'Successful' ? 'analysis--success' : 'analysis--failure'
                                }`}
                            >
                                <Button onClick={() => (selection?.objectMeta?.name === ar.objectMeta?.name ? setSelection(null) : setSelection(ar))}>
                                    {`Analysis ${temp[len - 2] + '-' + temp[len - 1]}`}
                                </Button>
                            </div>
                        </Tooltip>
                    );
                })}
            </div>
            {selection && selection.nonJobInfo && <MetricResultChart title={selection?.objectMeta?.name as string} series={chartData} />}
            {selection?.metrics && (
                <Space className='analysis__run__metrics__cards' key={selection.objectMeta?.name}>
                    {selection.metrics.map((metric) => {
                        return (
                            <Card className='analysis__run__metrics__cards__metric' key={metric.name} title={metric.name} size="small">
                                <Descriptions layout="vertical" column={{ md:2 }}>
                                {Object.keys(metric).filter((key) => key !== 'name').map((key) => {
                                    return (
                                    <Descriptions.Item key={key} label={key} span={2}
                                    labelStyle={{ fontSize:'12px' }} 
                                    contentStyle={{ fontSize:'12px' }}>
                                        {metric[key as keyof typeof metric]}
                                    </Descriptions.Item>
                                    );
                                }
                                )}
                                </Descriptions>
                            </Card>
                        );
                    })}
                </Space>
            )}
            
            {/* {selection && (
                <React.Fragment key={selection.objectMeta?.name}>
                    <AnalysisRunDetails analysisRun={selection} />
                    <div style={{marginTop: 5}}>
                        {selection.objectMeta?.name}
                        <i className={`fa ${selection.status === 'Successful' ? 'fa-check-circle analysis--success' : 'fa-times-circle analysis--failure'}`} />
                    </div>
                    {selection?.jobs && (
                        <div className='analysis__run__jobs'>
                            <div className='analysis__run__jobs-list'>
                                {selection.jobs.map((job) => {
                                    return (
                                        <PodWidget
                                            key={job.objectMeta?.name}
                                            name={job.objectMeta.name}
                                            status={job.status}
                                            tooltip={
                                                <div>
                                                    <div>job-name: {job.objectMeta?.name}</div>
                                                    <div>StartedAt: {formatTimestamp(JSON.stringify(job.startedAt))}</div>
                                                    <div>Status: {job.status}</div>
                                                    <div>MetricName: {job.metricName}</div>
                                                </div>
                                            }
                                            customIcon={faChartBar}
                                        />
                                    );
                                })}
                            </div>
                           
                            <Tooltip
                                title={selection?.metrics
                                    .filter((metric) => metric.name === selection.jobs[0].metricName)
                                    .map((metric) => {
                                        return (
                                            <React.Fragment key={metric.name}>
                                                {metric?.name && (
                                                    <div>
                                                        <b>MetricName:</b> {metric.name}
                                                    </div>
                                                )}
                                                {metric?.successCondition && (
                                                    <div>
                                                        <b>SuccessCondition: </b>
                                                        {metric.successCondition}
                                                    </div>
                                                )}
                                                {metric?.failureLimit && (
                                                    <div>
                                                        <b>FailureLimit:</b> {metric.failureLimit}
                                                    </div>
                                                )}
                                                {metric?.inconclusiveLimit && (
                                                    <div>
                                                        <b>InconclusiveLimit: </b>
                                                        {metric.inconclusiveLimit}
                                                    </div>
                                                )}
                                                {metric?.count && (
                                                    <div>
                                                        <b>Count: </b>
                                                        {metric.count}
                                                    </div>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                            >
                                <i className='fa fa-info-circle analysis__run__jobs-info' />
                            </Tooltip>
                        </div>
                    )}
                    {selection?.nonJobInfo && (
                        <div className='analysis__run__jobs'>
                            <div className='analysis__run__jobs-list'>
                                {selection.nonJobInfo.map((nonJob) => {
                                    return (
                                        <React.Fragment key={new Date(nonJob.startedAt.seconds).getTime()}>
                                            <PodWidget
                                                key={new Date(nonJob.startedAt.seconds).getTime()}
                                                name={nonJob.value}
                                                status={nonJob.status}
                                                tooltip={
                                                    <div>
                                                        <pre>Value: {JSON.stringify(JSON.parse(nonJob.value), null, 2)}</pre>
                                                        <div>StartedAt: {formatTimestamp(JSON.stringify(nonJob.startedAt))}</div>
                                                        <div>Status: {nonJob.status}</div>
                                                        <div>MetricName: {nonJob.metricName}</div>
                                                    </div>
                                                }
                                                customIcon={faChartBar}
                                            />
                                            </React.Fragment>
                                    );
                                })}
                            </div>
                            <Tooltip
                                title={selection?.metrics
                                    .filter((metric) => metric.name === selection.nonJobInfo[0].metricName)
                                    .map((metric) => {
                                        return (
                                            <React.Fragment key={metric.name}>
                                                {metric?.name && (
                                                    <div>
                                                        <b>MetricName:</b> {metric.name}
                                                    </div>
                                                )}
                                                {metric?.successCondition && (
                                                    <div>
                                                        <b>SuccessCondition: </b>
                                                        {metric.successCondition}
                                                    </div>
                                                )}
                                                {metric?.failureLimit && (
                                                    <div>
                                                        <b>FailureLimit:</b> {metric.failureLimit}
                                                    </div>
                                                )}
                                                {metric?.inconclusiveLimit && (
                                                    <div>
                                                        <b>InconclusiveLimit: </b>
                                                        {metric.inconclusiveLimit}
                                                    </div>
                                                )}
                                                {metric?.count && (
                                                    <div>
                                                        <b>Count: </b>
                                                        {metric.count}
                                                    </div>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                            >
                                <i className='fa fa-info-circle analysis__run__jobs-info' />
                            </Tooltip>
                        </div>
                    )}
                </React.Fragment>
            )} */}
        </div>
    );
};
