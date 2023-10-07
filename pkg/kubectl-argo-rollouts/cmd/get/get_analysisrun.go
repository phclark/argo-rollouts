package get

import (
	"context"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/juju/ansiterm"
	"github.com/spf13/cobra"

	"github.com/argoproj/argo-rollouts/pkg/apiclient/analysisrun"
	"github.com/argoproj/argo-rollouts/pkg/apiclient/rollout"
	"github.com/argoproj/argo-rollouts/pkg/kubectl-argo-rollouts/cmd/signals"
	"github.com/argoproj/argo-rollouts/pkg/kubectl-argo-rollouts/info"
	"github.com/argoproj/argo-rollouts/pkg/kubectl-argo-rollouts/options"
	completionutil "github.com/argoproj/argo-rollouts/pkg/kubectl-argo-rollouts/util/completion"
	"github.com/argoproj/argo-rollouts/pkg/kubectl-argo-rollouts/viewcontroller"
)

const (
	getAnalysisRunExample = `
	# Get an AnalysisRun
	%[1]s get analysisrun guestbook-76b9fd6d-52

	# Watch progress of an AnalysisRun
  	%[1]s get analysisrun guestbook-76b9fd6d-52 -w`
)

// NewCmdGetAnalysisRun returns a new instance of an `rollouts get analysisrun` command
func NewCmdGetAnalysisRun(o *options.ArgoRolloutsOptions) *cobra.Command {
	getOptions := GetOptions{
		ArgoRolloutsOptions: *o,
	}

	var cmd = &cobra.Command{
		Use:          "analysisrun ROLLOUT_NAME",
		Short:        "Get details about a analysisrun",
		Long:         "Get details about and visual representation of a analysisrun. " + getUsageCommon,
		Aliases:      []string{"ar", "analysisrun"},
		Example:      o.Example(getAnalysisRunExample),
		SilenceUsage: true,
		RunE: func(c *cobra.Command, args []string) error {
			if len(args) != 1 {
				return o.UsageErr(c)
			}
			name := args[0]
			controller := viewcontroller.NewAnalyisRunViewController(o.Namespace(), name, getOptions.KubeClientset(), getOptions.AnalysisRunClientset())
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			signals.SetupSignalHandler(cancel)
			controller.Start(ctx)

			ri, err := controller.GetAnalysisRunInfo()
			if err != nil {
				return err
			}
			if !getOptions.Watch {
				getOptions.PrintAnalysisRun(ri)
			} else {
				analysisrunUpdates := make(chan *rollout.AnalysisRunInfo)
				controller.RegisterCallback(func(arInfo *rollout.AnalysisRunInfo) {
					analysisrunUpdates <- arInfo
				})
				stopCh := ctx.Done()
				if getOptions.TimeoutSeconds > 0 {
					ts := time.Duration(getOptions.TimeoutSeconds)
					newCtx, cancel := context.WithTimeout(ctx, ts*time.Second)
					ctx = newCtx
					defer cancel()
					stopCh = newCtx.Done()
				}
				go getOptions.WatchAnalysisRun(stopCh, analysisrunUpdates)
				controller.Run(ctx)
				close(analyisrunUpdates)
			}
			return nil
		},
		ValidArgsFunction: completionutil.AnalysisRunNameCompletionFunc(o),
	}
	cmd.Flags().BoolVarP(&getOptions.Watch, "watch", "w", false, "Watch live updates to the analysisrun")
	cmd.Flags().BoolVar(&getOptions.NoColor, "no-color", false, "Do not colorize output")
	cmd.Flags().IntVar(&getOptions.TimeoutSeconds, "timeout-seconds", 0, "Timeout after specified seconds")
	return cmd
}

func AnalysisRunWatch(stopCh <-chan struct{}, analysisrunUpdates chan *analysisrun.AnalysisRunInfo, callback func(*analysisrun.AnalysisRunInfo)) {
	ticker := time.NewTicker(time.Second)
	var currAnalysisRunInfo *analysisrun.AnalysisRunInfo
	// preventFlicker is used to rate-limit the updates we print to the terminal when updates occur
	// so rapidly that it causes the terminal to flicker
	var preventFlicker time.Time

	for {
		select {
		case arInfo := <-analysisrunUpdates:
			currAnalysisRunInfo = arInfo
		case <-ticker.C:
		case <-stopCh:
			return
		}
		if currAnalysisRunInfo != nil && time.Now().After(preventFlicker.Add(200*time.Millisecond)) {
			callback(currAnalysisRunInfo)
			preventFlicker = time.Now()
		}
	}
}

func (o *GetOptions) WatchAnalysisRun(stopCh <-chan struct{}, analysisrunUpdates chan *analysisrun.AnalysisRunInfo) {
	Watch(stopCh, analysisrunUpdates,
		func(i *analysisrun.AnalysisRunInfo) {
			o.Clear()
			o.PrintAnalysisRun(i)
		})
}

// formatImage formats an ImageInfo with colorized imageinfo tags (e.g. canary, stable)
func (o *GetOptions) formatImage(image info.ImageInfo) string {
	imageStr := image.Image
	if len(image.Tags) > 0 {
		var colorizedTags []string
		for _, tag := range image.Tags {
			colorizedTags = append(colorizedTags, o.colorize(tag))
		}
		imageStr = fmt.Sprintf("%s (%s)", image.Image, strings.Join(colorizedTags, ", "))
	}
	return imageStr
}

func (o *GetOptions) PrintAnalysisRun(arInfo *analysisrun.AnalysisRunInfo) {
	fmt.Fprintf(o.Out, tableFormat, "Name:", arInfo.ObjectMeta.Name)
	fmt.Fprintf(o.Out, tableFormat, "Namespace:", arInfo.ObjectMeta.Namespace)
	fmt.Fprintf(o.Out, tableFormat, "Status:", o.colorize(arInfo.Icon)+" "+arInfo.Status)
	if arInfo.Message != "" {
		fmt.Fprintf(o.Out, tableFormat, "Message:", arInfo.Message)
	}
	fmt.Fprintf(o.Out, tableFormat, "Strategy:", arInfo.Strategy)
	if arInfo.Strategy == "Canary" {
		fmt.Fprintf(o.Out, tableFormat, "  Step:", arInfo.Step)
		fmt.Fprintf(o.Out, tableFormat, "  SetWeight:", arInfo.SetWeight)
		fmt.Fprintf(o.Out, tableFormat, "  ActualWeight:", arInfo.ActualWeight)
	}
	images := info.Images(arInfo)
	if len(images) > 0 {
		fmt.Fprintf(o.Out, tableFormat, "Images:", o.formatImage(images[0]))
		for i := 1; i < len(images); i++ {
			fmt.Fprintf(o.Out, tableFormat, "", o.formatImage(images[i]))
		}
	}
	fmt.Fprint(o.Out, "Replicas:\n")
	fmt.Fprintf(o.Out, tableFormat, "  Desired:", arInfo.Desired)
	fmt.Fprintf(o.Out, tableFormat, "  Current:", arInfo.Current)
	fmt.Fprintf(o.Out, tableFormat, "  Updated:", arInfo.Updated)
	fmt.Fprintf(o.Out, tableFormat, "  Ready:", arInfo.Ready)
	fmt.Fprintf(o.Out, tableFormat, "  Available:", arInfo.Available)

	fmt.Fprintf(o.Out, "\n")
	o.PrintAnalysisRunTree(arInfo)
}

func (o *GetOptions) PrintAnalysisRunTree(arInfo *analysisrun.AnalysisRunInfo) {
	w := ansiterm.NewTabWriter(o.Out, 0, 0, 2, ' ', 0)
	o.PrintHeader(w)
	fmt.Fprintf(w, "%s %s\t%s\t%s %s\t%s\t%v\n", IconAnalysis, arInfo.ObjectMeta.Name, "AnalysisRun", o.colorize(arInfo.Icon), arInfo.Status, info.Age(*arInfo.ObjectMeta), "")
	revisions := info.Revisions(arInfo)
	for i, rev := range revisions {
		isLast := i == len(revisions)-1
		prefix, subpfx := getPrefixes(isLast, "")
		o.PrintRevision(w, arInfo, rev, prefix, subpfx)
	}
	_ = w.Flush()
}

// func (o *GetOptions) PrintRevision(w io.Writer, arInfo *analysisrun.AnalysisRunInfo, revision int, prefix string, subpfx string) {
// 	name := fmt.Sprintf("revision:%d", revision)
// 	fmt.Fprintf(w, "%s%s %s\t%s\t%s %s\t%s\t%v\n", prefix, IconRevision, name, "", "", "", "", "")
// 	replicaSets := info.ReplicaSetsByRevision(arInfo, revision)
// 	experiments := info.ExperimentsByRevision(arInfo, revision)
// 	analysisRuns := info.AnalysisRunsByRevision(arInfo, revision)
// 	total := len(replicaSets) + len(experiments) + len(analysisRuns)
// 	curr := 0

// 	for _, rsInfo := range replicaSets {
// 		childPrefix, childSubpfx := getPrefixes(curr == total-1, subpfx)
// 		o.PrintReplicaSetInfo(w, *rsInfo, childPrefix, childSubpfx)
// 		curr++
// 	}
// 	for _, expInfo := range experiments {
// 		childPrefix, childSubpfx := getPrefixes(curr == total-1, subpfx)
// 		o.PrintExperimentInfo(w, *expInfo, childPrefix, childSubpfx)
// 		curr++
// 	}
// 	for _, arInfo := range analysisRuns {
// 		childPrefix, childSubpfx := getPrefixes(curr == total-1, subpfx)
// 		o.PrintAnalysisRunInfo(w, *arInfo, childPrefix, childSubpfx)
// 		curr++
// 	}
// }

// func (o *GetOptions) PrintReplicaSetInfo(w io.Writer, rsInfo analysisrun.ReplicaSetInfo, prefix string, subpfx string) {
// 	infoCols := []string{}
// 	name := rsInfo.ObjectMeta.Name
// 	if rsInfo.Stable {
// 		infoCols = append(infoCols, o.colorize(info.InfoTagStable))
// 		name = o.colorizeStatus(name, info.InfoTagStable)
// 	}
// 	if rsInfo.Canary {
// 		infoCols = append(infoCols, o.colorize(info.InfoTagCanary))
// 		name = o.colorizeStatus(name, info.InfoTagCanary)
// 	} else if rsInfo.Active {
// 		infoCols = append(infoCols, o.colorize(info.InfoTagActive))
// 		name = o.colorizeStatus(name, info.InfoTagActive)
// 	} else if rsInfo.Preview {
// 		infoCols = append(infoCols, o.colorize(info.InfoTagPreview))
// 		name = o.colorizeStatus(name, info.InfoTagPreview)
// 	}
// 	if rsInfo.Ping {
// 		infoCols = append(infoCols, o.colorize(info.InfoTagPing))
// 		name = o.colorizeStatus(name, info.InfoTagPing)
// 	}
// 	if rsInfo.Pong {
// 		infoCols = append(infoCols, o.colorize(info.InfoTagPong))
// 		name = o.colorizeStatus(name, info.InfoTagPong)
// 	}
// 	if rsInfo.ScaleDownDeadline != "" {
// 		infoCols = append(infoCols, fmt.Sprintf("delay:%s", info.ScaleDownDelay(rsInfo)))
// 	}

// 	fmt.Fprintf(w, "%s%s %s\t%s\t%s %s\t%s\t%v\n", prefix, IconReplicaSet, name, "ReplicaSet", o.colorize(rsInfo.Icon), rsInfo.Status, info.Age(*rsInfo.ObjectMeta), strings.Join(infoCols, ","))
// 	for i, podInfo := range rsInfo.Pods {
// 		isLast := i == len(rsInfo.Pods)-1
// 		podPrefix, _ := getPrefixes(isLast, subpfx)
// 		podInfoCol := []string{fmt.Sprintf("ready:%s", podInfo.Ready)}
// 		if podInfo.Restarts > 0 {
// 			podInfoCol = append(podInfoCol, fmt.Sprintf("restarts:%d", podInfo.Restarts))
// 		}
// 		fmt.Fprintf(w, "%s%s %s\t%s\t%s %s\t%s\t%v\n", podPrefix, IconPod, podInfo.ObjectMeta.Name, "Pod", o.colorize(podInfo.Icon), podInfo.Status, info.Age(*podInfo.ObjectMeta), strings.Join(podInfoCol, ","))
// 	}
// }

func (o *GetOptions) PrintAnalysisRunInfo(w io.Writer, arInfo analysisrun.AnalysisRunInfo, prefix string, subpfx string) {
	name := o.colorizeStatus(arInfo.ObjectMeta.Name, arInfo.Status)
	infoCols := []string{}
	if arInfo.Successful > 0 {
		infoCols = append(infoCols, fmt.Sprintf("%s %d", o.colorize(info.IconOK), arInfo.Successful))
	}
	if arInfo.Failed > 0 {
		infoCols = append(infoCols, fmt.Sprintf("%s %d", o.colorize(info.IconBad), arInfo.Failed))
	}
	if arInfo.Inconclusive > 0 {
		infoCols = append(infoCols, fmt.Sprintf("%s %d", o.colorize(info.IconUnknown), arInfo.Inconclusive))
	}
	if arInfo.Error > 0 {
		infoCols = append(infoCols, fmt.Sprintf("%s %d", o.colorize(info.IconWarning), arInfo.Error))
	}
	fmt.Fprintf(w, "%s%s %s\t%s\t%s %s\t%s\t%v\n", prefix, IconAnalysis, name, "AnalysisRun", o.colorize(arInfo.Icon), arInfo.Status, info.Age(*arInfo.ObjectMeta), strings.Join(infoCols, ","))
	for i, jobInfo := range arInfo.Jobs {
		isLast := i == len(arInfo.Jobs)-1
		jobPrefix, jobChildPrefix := getPrefixes(isLast, subpfx)
		o.PrintJob(w, *jobInfo, jobPrefix, jobChildPrefix)
	}
}

// func (o *GetOptions) PrintJob(w io.Writer, jobInfo analysisrun.JobInfo, prefix string, subpfx string) {
// 	name := o.colorizeStatus(jobInfo.ObjectMeta.Name, jobInfo.Status)
// 	fmt.Fprintf(w, "%s%s %s\t%s\t%s %s\t%s\t%v\n", prefix, IconJob, name, "Job", o.colorize(jobInfo.Icon), jobInfo.Status, info.Age(*jobInfo.ObjectMeta), "")
// }
