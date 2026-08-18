(function (window) {
    "use strict";

    var VMS = window.VMS = window.VMS || {};
    var MAX_SAFE_INTEGER_TEXT = "9007199254740991";

    function strip(value) {
        var text = String(value || "0").replace(/^0+/, "");
        return text || "0";
    }

    function compare(left, right) {
        left = strip(left);
        right = strip(right);
        if (left.length !== right.length) {
            return left.length < right.length ? -1 : 1;
        }
        return left === right ? 0 : (left < right ? -1 : 1);
    }

    function add(left, right) {
        var index = Math.max(left.length, right.length) - 1;
        var leftIndex = left.length - 1;
        var rightIndex = right.length - 1;
        var carry = 0;
        var output = "";
        var sum;
        while (index >= 0) {
            sum = carry + (leftIndex >= 0 ? Number(left.charAt(leftIndex)) : 0) + (rightIndex >= 0 ? Number(right.charAt(rightIndex)) : 0);
            output = String(sum % 10) + output;
            carry = Math.floor(sum / 10);
            leftIndex -= 1;
            rightIndex -= 1;
            index -= 1;
        }
        return strip((carry ? String(carry) : "") + output);
    }

    function subtract(left, right) {
        var leftIndex = left.length - 1;
        var rightIndex = right.length - 1;
        var borrow = 0;
        var output = "";
        var digit;
        while (leftIndex >= 0) {
            digit = Number(left.charAt(leftIndex)) - borrow - (rightIndex >= 0 ? Number(right.charAt(rightIndex)) : 0);
            if (digit < 0) {
                digit += 10;
                borrow = 1;
            } else {
                borrow = 0;
            }
            output = String(digit) + output;
            leftIndex -= 1;
            rightIndex -= 1;
        }
        return strip(output);
    }

    function multiply(left, right) {
        var result = [];
        var leftIndex;
        var rightIndex;
        var position;
        var product;
        var carry;
        left = strip(left);
        right = strip(right);
        if (left === "0" || right === "0") {
            return "0";
        }
        for (leftIndex = 0; leftIndex < left.length + right.length; leftIndex += 1) {
            result[leftIndex] = 0;
        }
        for (leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
            carry = 0;
            for (rightIndex = right.length - 1; rightIndex >= 0; rightIndex -= 1) {
                position = leftIndex + rightIndex + 1;
                product = Number(left.charAt(leftIndex)) * Number(right.charAt(rightIndex)) + result[position] + carry;
                result[position] = product % 10;
                carry = Math.floor(product / 10);
            }
            result[leftIndex] += carry;
        }
        return strip(result.join(""));
    }

    function divideAndRound(value, divisor) {
        var quotient = "";
        var remainder = 0;
        var index;
        var current;
        for (index = 0; index < value.length; index += 1) {
            current = remainder * 10 + Number(value.charAt(index));
            quotient += String(Math.floor(current / divisor));
            remainder = current % divisor;
        }
        quotient = strip(quotient);
        if (remainder * 2 >= divisor) {
            quotient = add(quotient, "1");
        }
        return quotient;
    }

    function expandExponent(text) {
        var match = /^([+-]?)(\d+)(?:\.(\d*))?[eE]([+-]?\d+)$/.exec(text);
        var digits;
        var decimalPosition;
        var exponent;
        if (!match) {
            return text;
        }
        digits = match[2] + (match[3] || "");
        decimalPosition = match[2].length;
        exponent = Number(match[4]);
        decimalPosition += exponent;
        if (decimalPosition <= 0) {
            return match[1] + "0." + new Array(1 - decimalPosition).join("0") + digits;
        }
        if (decimalPosition >= digits.length) {
            return match[1] + digits + new Array(decimalPosition - digits.length + 1).join("0");
        }
        return match[1] + digits.substring(0, decimalPosition) + "." + digits.substring(decimalPosition);
    }

    function fixed(value, scale) {
        var text = expandExponent(String(value === null || value === undefined || value === "" ? "0" : value).replace(/^\s+|\s+$/g, ""));
        var match = /^([+-]?)(\d+)(?:\.(\d*))?$/.exec(text);
        var fraction;
        var digits;
        var roundDigit;
        if (!match) {
            return null;
        }
        fraction = match[3] || "";
        roundDigit = fraction.length > scale ? Number(fraction.charAt(scale)) : 0;
        fraction = fraction.substring(0, scale);
        while (fraction.length < scale) {
            fraction += "0";
        }
        digits = strip(match[2] + fraction);
        if (roundDigit >= 5) {
            digits = add(digits, "1");
        }
        return { negative: match[1] === "-" && digits !== "0", digits: digits, scale: scale };
    }

    function safeNumber(fixedValue) {
        if (!fixedValue || compare(fixedValue.digits, MAX_SAFE_INTEGER_TEXT) > 0) {
            return null;
        }
        return (fixedValue.negative ? -1 : 1) * Number(fixedValue.digits) / Math.pow(10, fixedValue.scale);
    }

    function error(field, code, message, errors) {
        errors.push(VMS.ValidationService.error(field, code, message));
    }

    function percentAmount(amount, inputValue, field, errors) {
        var percentage = fixed(inputValue, 6);
        if (!percentage || percentage.negative || compare(percentage.digits, "100000000") > 0) {
            error(field, "INVALID_PERCENTAGE", "Percentage must be between 0 and 100.", errors);
            return "0";
        }
        return divideAndRound(multiply(amount, percentage.digits), 100000000);
    }

    function moneyAmount(inputValue, field, errors) {
        var amount = fixed(inputValue, 2);
        if (!amount || amount.negative) {
            error(field, "INVALID_AMOUNT", "Enter a valid non-negative amount.", errors);
            return "0";
        }
        return amount.digits;
    }

    VMS.FinancialCalculationService = {
        sumMoney: function (values) {
            var total = "0";
            var valid = true;
            var parsed;
            var index;
            for (index = 0; index < (values || []).length; index += 1) {
                parsed = fixed(values[index], 2);
                if (!parsed || parsed.negative) {
                    valid = false;
                    break;
                }
                total = add(total, parsed.digits);
            }
            return valid ? safeNumber({ negative: false, digits: total, scale: 2 }) : null;
        },
        subtractMoney: function (left, right) {
            var leftValue = fixed(left, 2);
            var rightValue = fixed(right, 2);
            if (!leftValue || !rightValue || leftValue.negative || rightValue.negative || compare(leftValue.digits, rightValue.digits) < 0) {
                return null;
            }
            return safeNumber({ negative: false, digits: subtract(leftValue.digits, rightValue.digits), scale: 2 });
        },
        calculate: function (input) {
            var totalValue = fixed(input.TotalPrice, 2);
            var rateValue = fixed(input.ConversionRateUsed, 6);
            var total = totalValue && !totalValue.negative ? totalValue.digits : "0";
            var discount = "0";
            var net;
            var vat = "0";
            var finalAmount;
            var errors = [];
            var values;

            if (!totalValue || totalValue.negative || compare(total, "0") <= 0) {
                error("TotalPrice", "INVALID_AMOUNT", "Total Price must be greater than zero.", errors);
            }
            if (!rateValue || rateValue.negative || compare(rateValue.digits, "0") <= 0) {
                error("ConversionRateUsed", "INVALID_RATE", "Conversion Rate must be greater than zero.", errors);
                rateValue = { negative: false, digits: "0", scale: 6 };
            }
            if (input.HasDiscount === true) {
                if (input.DiscountInputTypeCode === "PERCENTAGE") {
                    discount = percentAmount(total, input.DiscountInputValue, "DiscountInputValue", errors);
                } else if (input.DiscountInputTypeCode === "AMOUNT") {
                    discount = moneyAmount(input.DiscountInputValue, "DiscountInputValue", errors);
                    if (compare(discount, total) > 0) {
                        error("DiscountInputValue", "INVALID_AMOUNT", "Discount amount must be between zero and Total Price.", errors);
                    }
                } else {
                    error("DiscountInputTypeCode", "REQUIRED", "Select a discount type.", errors);
                }
            }
            net = compare(total, discount) >= 0 ? subtract(total, discount) : "0";
            if (input.HasVAT === true) {
                if (input.VATInputTypeCode === "PERCENTAGE") {
                    vat = percentAmount(net, input.VATInputValue, "VATInputValue", errors);
                } else if (input.VATInputTypeCode === "AMOUNT") {
                    vat = moneyAmount(input.VATInputValue, "VATInputValue", errors);
                } else {
                    error("VATInputTypeCode", "REQUIRED", "Select a VAT type.", errors);
                }
            }
            finalAmount = add(net, vat);
            if (compare(finalAmount, "0") <= 0) {
                error("FinalInvoiceAmount", "INVALID_AMOUNT", "Final Invoice Amount must be greater than zero.", errors);
            }
            values = {
                TotalPrice: safeNumber({ negative: false, digits: total, scale: 2 }),
                DiscountAmount: safeNumber({ negative: false, digits: discount, scale: 2 }),
                NetAmountBeforeVAT: safeNumber({ negative: false, digits: net, scale: 2 }),
                VATAmount: safeNumber({ negative: false, digits: vat, scale: 2 }),
                FinalInvoiceAmount: safeNumber({ negative: false, digits: finalAmount, scale: 2 }),
                ConversionRateUsed: safeNumber(rateValue),
                TotalPriceInSAR: safeNumber({ negative: false, digits: divideAndRound(multiply(total, rateValue.digits), 1000000), scale: 2 }),
                VATAmountInSAR: safeNumber({ negative: false, digits: divideAndRound(multiply(vat, rateValue.digits), 1000000), scale: 2 }),
                FinalInvoiceAmountInSAR: safeNumber({ negative: false, digits: divideAndRound(multiply(finalAmount, rateValue.digits), 1000000), scale: 2 })
            };
            if (values.TotalPrice === null || values.FinalInvoiceAmount === null || values.ConversionRateUsed === null || values.TotalPriceInSAR === null || values.VATAmountInSAR === null || values.FinalInvoiceAmountInSAR === null) {
                error("TotalPrice", "AMOUNT_TOO_LARGE", "The calculation exceeds the supported precise numeric range.", errors);
            }
            return { valid: errors.length === 0, fieldErrors: errors, values: values };
        }
    };
}(window));
