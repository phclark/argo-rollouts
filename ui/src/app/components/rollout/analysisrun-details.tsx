import * as React from 'react';
import {KubeConfig, CustomObjectsApi} from '@kubernetes/client-node';
import {RolloutAnalysisRunInfo} from '../../../models/rollout/generated';

export const AnalysisRunDetails = (props: {analysisRun: RolloutAnalysisRunInfo}) => {
    const {analysisRun} = props;
    const [analysisRunDetails, setAnalysisRunDetails] = React.useState(null);

    // Fetch the AnalysisRun details when the component is mounted
    React.useEffect(() => {
        const kubeConfig = new KubeConfig();
        kubeConfig.loadFromDefault();
        const customObjectsApi = kubeConfig.makeApiClient(CustomObjectsApi);

        customObjectsApi.getNamespacedCustomObject('argoproj.io', 'v1alpha1', analysisRun.objectMeta.namespace, 'analysisruns', analysisRun.objectMeta.name).then((response) => {
            console.log(response);

            setAnalysisRunDetails(response.body);
            //   analysisRunDetails: {
            //     name: metadata.name,
            //     namespace: metadata.namespace,
            //     creationTimestamp: metadata.creationTimestamp,
            //     status: status.phase,
            //     inconclusive: status.inconclusive,
            //     successful: status.successful,
            //   },
            // });
        });
    }, [analysisRun.objectMeta.name, analysisRun.objectMeta.namespace]);

    if (!analysisRunDetails) {
        return <div>Loading...</div>;
    }

    console.log('AnalysisRunChart', analysisRun);

    return (
        <div className='analysis'>
            <div className='analysis-header'>TestAnalysis Run Metric Results</div>
            <div className='analysis__runs'>
                <div className='analysis__status' style={{display: 'block'}}>
                    <span>Status:</span> {analysisRunDetails.status}
                    <br />
                </div>
                <div className='analysis__inconclusive' style={{display: 'block'}}>
                    <span>Inconclusive Measurements:</span> {analysisRunDetails.inconclusive}
                    <br />
                </div>
                <div className='analysis__successful' style={{display: 'block'}}>
                    <span>Successful Measurements:</span> {analysisRunDetails.successful}
                    <br />
                </div>
            </div>
        </div>
    );
};
