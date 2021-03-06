// Returns a function, that, as long as it continues to be invoked, will not
// be triggered. The function will be called after it stops being called for
// N milliseconds. If `immediate` is passed, trigger the function on the
// leading edge, instead of the trailing.
function debounce(func, wait, immediate) {
	var timeout;
	return function() {
		var context = this, args = arguments;
		var later = function() {
			timeout = null;
			if (!immediate) func.apply(context, args);
		};
		var callNow = immediate && !timeout;
		clearTimeout(timeout);
		timeout = setTimeout(later, wait);
		if (callNow) func.apply(context, args);
	};
};

const methods = (() => {
    let charts = {
        taxDiffChart: null,
        taxChart: null,
    };

    const methods = {
        onIncomeUpdate: (() => {
            let last = {
                USState: null,
                numDependents: null,
                filingStatus: null,
            };

            return function () {
                const { incomeRange, USState, numDependents, filingStatus } = this.$refs;

                store.state = USState.value;
                store.income = taxes.convertLinearRangeToIncome(incomeRange.value);
                store.numExemptions = 1 + (+numDependents.value);
                store.filingStatus = filingStatus.value;

                store.tax.state = taxes.calculateStateTaxBurden(
                    store.income,
                    false,
                    TAX_RATES[2017].state[USState.value]
                );

                ["current", "senate", "house"].forEach(bill => {
                    store.tax[bill] = taxes.calculateFederalTaxBurden[bill]({
                        income: store.income,
                        numExemptions: store.numExemptions,
                        SALT: store.tax.state,
                        filingStatus: store.filingStatus,
                    });
                });

                ["senate", "house"].forEach(bill => {
                    store.taxDiff[bill] = store.tax[bill] / store.tax.current - 1;
                });

                const payload = methods.renderChart();
                methods.taxesByState(store.MAP_BILL);

                if (payload) {
                    const { taxDiffChart, taxChart } = payload;

                    charts.taxDiffChart = taxDiffChart;
                    charts.taxChart = taxChart;
                    charts.HAVE_RENDERED = true;
                }

                if (typeof router !== "undefined") {
                    router.setHash(`/i/${store.income}/s/${store.filingStatus}/d/${store.numExemptions - 1}/`);
                }
            }
        })(),

        renderChart: () => {
            const state = vue.$refs.USState.value;
            const numDependents = vue.$refs.numDependents.value;
            const numExemptions = 1 + (+numDependents);

            const arr = [];
            for (let x = 0; x < 100; x++) {
                arr[x] = x * 5000;
            }

            const schedules = [
                { bill: "current", name: "Current Federal Taxes", color: "#e8757c" },
                { bill: "senate", name: "Senate Proposed Federal Taxes", color: "#51badc", dashStyle: "longdash" },
                { bill: "house", name: "House Proposed Federal Taxes", color: "#b9e48c", dashStyle: "longdash" }
            ];

            const taxChartData = schedules.map(schedule => {
                return {
                    name: schedule.name,
                    data: arr.map(income => {
                        return taxes.calculateFederalTaxBurden[schedule.bill]({
                            income: income,
                            numExemptions,
                            SALT: taxes.calculateStateTaxBurden(income, false, TAX_RATES[2017].state[state]),
                            filingStatus: store.filingStatus,
                        }) / income * 100;
                    }),
                    color: schedule.color,
                    dashStyle: schedule.dashStyle,
                };
            });

            const taxDiffChartData = schedules.slice(1).map(schedule => {
                return {
                    name: schedule.name,
                    data: arr.map(income => {
                        const percentTaxOnBill = taxes.calculateFederalTaxBurden[schedule.bill]({
                            income: income,
                            numExemptions,
                            SALT: taxes.calculateStateTaxBurden(income, false, TAX_RATES[2017].state[state]),
                            filingStatus: store.filingStatus,
                        }) / income * 100;
                        const percentTaxOnCurrent = taxes.calculateFederalTaxBurden.current({
                            income: income,
                            numExemptions,
                            SALT: taxes.calculateStateTaxBurden(income, false, TAX_RATES[2017].state[state]),
                            filingStatus: store.filingStatus,
                        }) / income * 100;

                        const value = ((percentTaxOnBill / percentTaxOnCurrent - 1) * 100) || 0;

                        // change to logarithmic y-axis tomorrow.
                        return Math.min(500, value);
                    }),
                    color: schedule.color,
                    dashStyle: schedule.dashStyle,
                };
            });

            // check to see if any of the charts have rendered.
            // if not, create new ones.
            if (!charts.HAVE_RENDERED) {
                const taxChart = chart.render({
                    data: taxChartData,
                    title: "Federal Taxes as a Percentage of Net Income",
                    yAxisText: "Percent of Income to Federal Tax",
                    container: "tax_chart_container",
                })

                const taxDiffChart = chart.render({
                    data: taxDiffChartData,
                    title: "New Taxes as a Percentage of Old Taxes",
                    yAxisText: "% Taxes Paid by Plan vs. Current",
                    container: "tax_diff_container",
                });

                return { taxDiffChart, taxChart };
            // otherwise re-use the old ones and just update the data.
            } else {
                chart.updateData(charts.taxChart, taxChartData);
                chart.updateData(charts.taxDiffChart, taxDiffChartData);
            }
        },

        taxesByState: (bill) => {
            const colors = store.MAP_COLORS;

            const taxesByState = Object.keys(STATES).map(state => {
                const proto = {
                    state,
                    stateTaxes: taxes.calculateStateTaxBurden(
                        store.income,
                        false,
                        TAX_RATES[2017].state[state]
                    ),
                    taxes: {
                        current: null,
                        senate: null,
                        house: null,
                    },
                };

                proto.taxes.current = taxes.calculateFederalTaxBurden.current({
                    income: store.income,
                    numExemptions: store.numExemptions,
                    SALT: proto.stateTaxes,
                    filingStatus: store.filingStatus,
                });

                proto.taxes.senate = taxes.calculateFederalTaxBurden.senate({
                    income: store.income,
                    numExemptions: store.numExemptions,
                    SALT: proto.stateTaxes,
                    filingStatus: store.filingStatus,
                }) / proto.taxes.current - 1;

                proto.taxes.house = taxes.calculateFederalTaxBurden.house({
                    income: store.income,
                    numExemptions: store.numExemptions,
                    SALT: proto.stateTaxes,
                    filingStatus: store.filingStatus,
                }) / proto.taxes.current - 1;

                return proto;
            });

            taxesByState.forEach(state => {
                let idx = 0;
                while (state.taxes[bill] * 100 > colors[idx][0] && colors[idx + 1]) idx++;

                $(`svg #${state.state}`).css("fill", colors[idx][1]);
            });
        },


        // this changes a decimal to a properly formatted percentage.
        toPercent: (value) => {
            var shouldSign = value > 0;

            if (isNaN(value)) {
                return 'N/A';
            }

            return (shouldSign ? '+' : '') + (value * 100).toFixed(2) + '%';
        },

        toDollar: (value, precision) => {
            precision = typeof precision === "number" ? precision : 2;
            return `$` + value.toLocaleString(undefined, {
                minimumFractionDigits: precision,
                maximumFractionDigits: precision
            });
        },
    };

    return methods;
})();
